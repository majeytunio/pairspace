/**
 * Author: Ali Quraishi
 *
 * Collaborative whiteboard. tldraw's own store is a plain JS object graph,
 * so we mirror it into a shared Yjs Y.Map ("tl_records") and back:
 *   tldraw local change -> store.listen() -> write into Y.Map
 *   Y.Map remote change -> observeDeep()  -> tldraw store.put()
 * This keeps tldraw fully decoupled from the network; Yjs is the only
 * thing that talks to Supabase Realtime, same as the code editor.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { Tldraw, createTLStore, defaultShapeUtils, type TLRecord, type Editor as TldrawEditor } from "tldraw";
import "tldraw/tldraw.css";
import type * as Y from "yjs";
import type { SupabaseYjsProvider } from "@/lib/yjs/supabase-provider";

type WhiteboardProps = {
  doc: Y.Doc;
  provider: SupabaseYjsProvider | undefined;
  ready: boolean;
};

export default function Whiteboard({ doc, provider, ready }: WhiteboardProps) {
  const [store] = useState(() => createTLStore({ shapeUtils: defaultShapeUtils }));
  const editorRef = useRef<TldrawEditor | null>(null);
  const applyingRemote = useRef(false);

  useEffect(() => {
    if (!ready || !provider) return;

    const records = doc.getMap<TLRecord>("tl_records");

    // Seed the local store from whatever is already in the CRDT (covers
    // both "restored from snapshot" and "peer already drew something").
    const initial = Array.from(records.values());
    if (initial.length) {
      applyingRemote.current = true;
      store.put(initial);
      applyingRemote.current = false;
    }

    // tldraw -> Yjs
    const unsubscribeStore = store.listen(
      ({ changes }) => {
        if (applyingRemote.current) return;
        doc.transact(() => {
          for (const record of Object.values(changes.added)) records.set(record.id, record);
          for (const [, record] of Object.values(changes.updated)) records.set(record.id, record as TLRecord);
          for (const record of Object.values(changes.removed)) records.delete(record.id);
        });
      },
      { source: "user", scope: "document" }
    );

    // Yjs -> tldraw
    const observer = () => {
      applyingRemote.current = true;
      const snapshot = Array.from(records.values());
      const currentIds = new Set(store.allRecords().map((r) => r.id));
      const incomingIds = new Set(snapshot.map((r) => r.id));

      store.put(snapshot);
      for (const id of currentIds) {
        if (!incomingIds.has(id)) store.remove([id as never]);
      }
      applyingRemote.current = false;
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
