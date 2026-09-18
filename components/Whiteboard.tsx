/**
 * Author: Ali Quraishi
 *
 * Collaborative whiteboard. tldraw's own store is a plain JS object graph,
 * so we mirror it into a shared Yjs Y.Map ("tl_records") and back:
 *   tldraw local change -> store.listen() -> write into Y.Map
 *   Y.Map remote change -> observeDeep()  -> tldraw store.mergeRemoteChanges()
 *
 * BUG THIS FIXES: a Y.Map observer fires on every change to the map,
 * including changes WE just wrote ourselves a moment earlier via
 * store.listen(). Without filtering that out, every local edit
 * immediately re-triggered the observer, which re-applied the (already
 * current) record back into the live tldraw store — including while a
 * stroke was still mid-drag. That re-injection during an active
 * interaction is what corrupted/dropped strokes before they ever made it
 * out over the network. The fix: tag network-applied Yjs transactions
 * with a distinguishable origin (REMOTE_ORIGIN, exported from
 * supabase-provider.ts) and have the observer ignore anything that isn't
 * tagged that way — i.e. ignore our own writes, since the local tldraw
 * store already reflects them and doesn't need to be told again.
 *
 * Applying incoming changes via store.mergeRemoteChanges() (rather than
 * plain store.put()) is tldraw's own documented mechanism for exactly
 * this multiplayer scenario: it tags the resulting store change as
 * source "remote", which store.listen's {source: "user"} filter already
 * excludes — so there's no need for a manual "am I currently applying a
 * remote update" boolean flag on that side either.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { Tldraw, createTLStore, defaultShapeUtils, type TLRecord, type Editor as TldrawEditor } from "tldraw";
import "tldraw/tldraw.css";
import * as Y from "yjs";
import type { SupabaseYjsProvider } from "@/lib/yjs/supabase-provider";
import { REMOTE_ORIGIN } from "@/lib/yjs/supabase-provider";

type WhiteboardProps = {
  doc: Y.Doc;
  provider: SupabaseYjsProvider | undefined;
  ready: boolean;
};

export default function Whiteboard({ doc, provider, ready }: WhiteboardProps) {
  const [store] = useState(() => createTLStore({ shapeUtils: defaultShapeUtils }));
  const editorRef = useRef<TldrawEditor | null>(null);

  // IDs we've written into the local store *because Yjs told us to*.
  // Diffed against on every remote update instead of the whole local
  // store, because the store also holds records tldraw manages itself
  // (instance state, camera, focus, page state) that were never in the
  // Yjs map and must never be deleted by this sync logic — deleting one
  // of those is what caused the earlier "reading 'isFocused'" crash.
  const syncedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!ready || !provider) return;

    const records = doc.getMap<TLRecord>("tl_records");

    // Seed the local store from whatever is already in the CRDT (covers
    // both "restored from snapshot" and "peer already drew something").
    // Goes through mergeRemoteChanges too, so a page reload doesn't
    // create a bogus "undo" entry for content that was never a local
    // action.
    const initial = Array.from(records.values());
    if (initial.length) {
      store.mergeRemoteChanges(() => {
        store.put(initial);
      });
    }
    syncedIds.current = new Set<string>(initial.map((r) => r.id));

    // tldraw -> Yjs. Only fires for genuine user-driven, document-scoped
    // changes — store.mergeRemoteChanges() below tags its own writes as
    // source "remote", so they're already excluded by this filter and
    // don't loop back out over the network.
    const unsubscribeStore = store.listen(
      ({ changes }) => {
        doc.transact(() => {
          for (const record of Object.values(changes.added)) {
            records.set(record.id, record);
            syncedIds.current.add(record.id);
          }
          for (const [, record] of Object.values(changes.updated)) {
            records.set(record.id, record as TLRecord);
            syncedIds.current.add(record.id);
          }
          for (const record of Object.values(changes.removed)) {
            records.delete(record.id);
            syncedIds.current.delete(record.id);
          }
        });
      },
      { source: "user", scope: "document" }
    );

    // Yjs -> tldraw. Guard against reacting to our own writes: a Y.Map
    // observer fires for every change regardless of who made it, so
    // without this check every local edit would immediately re-trigger
    // this handler and re-inject the (already current) record back into
    // the live tldraw store — including mid-drag, which is what was
    // corrupting/losing strokes before they got broadcast.
    const observer = (_events: Y.YEvent<any>[], transaction: Y.Transaction) => {
      if (transaction.origin !== REMOTE_ORIGIN) return;

      const snapshot = Array.from(records.values());
      const incomingIds = new Set<string>(snapshot.map((r) => r.id));

      // Only remove records that Yjs previously gave us and has now
      // dropped — anything else in the local store belongs to tldraw
      // itself and is out of scope for this sync.
      const toRemove = Array.from(syncedIds.current).filter(
        (id) => !incomingIds.has(id)
      ) as unknown as TLRecord["id"][];

      store.mergeRemoteChanges(() => {
        store.put(snapshot);
        if (toRemove.length) store.remove(toRemove);
      });

      syncedIds.current = incomingIds;
    };
    records.observeDeep(observer);

    return () => {
      unsubscribeStore();
      records.unobserveDeep(observer);
    };
  }, [doc, provider, ready, store]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-md border border-line">
      {!ready && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-paper text-sm text-ink/60">
          Loading whiteboard…
        </div>
      )}
      <Tldraw
        store={store}
        onMount={(editor) => {
          editorRef.current = editor;
        }}
      />
    </div>
  );
}
