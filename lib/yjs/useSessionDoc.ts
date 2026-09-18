/**
 * Author: Ali Quraishi
 *
 * useSessionDoc — one hook that ties together everything a session
 * surface (editor or whiteboard) needs:
 *   - a Y.Doc
 *   - the Supabase realtime provider for live sync
 *   - snapshot load-on-mount + debounced autosave
 *   - a simple online-user roster via Supabase Presence
 *
 * Both the code editor and the whiteboard use this with different
 * `docId`s so they get independent CRDT documents that still share the
 * same session's Realtime channel namespace.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { createClient } from "@/lib/supabase/client";
import { SupabaseYjsProvider } from "./supabase-provider";
import { attachAutosave, loadSnapshot } from "./persistence";

export type PresenceUser = {
  userId: string;
  name: string;
  color: string;
};

type UseSessionDocArgs = {
  sessionId: string;
  docId: string; // "main" for the editor, "whiteboard" for tldraw
  table: "doc_snapshots" | "whiteboard_snapshots";
  user: PresenceUser;
};

export function useSessionDoc({ sessionId, docId, table, user }: UseSessionDocArgs) {
  const docRef = useRef<Y.Doc>();
  const providerRef = useRef<SupabaseYjsProvider>();
  const detachAutosaveRef = useRef<() => void>();
  const [ready, setReady] = useState(false);
  const [peers, setPeers] = useState<PresenceUser[]>([]);

  if (!docRef.current) docRef.current = new Y.Doc();

  useEffect(() => {
    const supabase = createClient();
    const doc = docRef.current!;
    let cancelled = false;

    (async () => {
      // 1. Restore last snapshot before wiring up live sync, so we don't
      //    briefly show an empty doc while catching up over the network.
      await loadSnapshot(
        supabase,
        doc,
        table === "doc_snapshots"
          ? { table, sessionId, docId }
          : { table, sessionId }
      );
      if (cancelled) return;

      // 2. Connect the realtime CRDT bridge.
      const provider = new SupabaseYjsProvider(supabase, `session:${sessionId}:${docId}`, doc);
      provider.awareness.setLocalState({ user });
      provider.connect();
      providerRef.current = provider;

      provider.awareness.on("change", () => {
        const states = Array.from(provider.awareness.getStates().values()) as { user?: PresenceUser }[];
        setPeers(states.map((s) => s.user).filter(Boolean) as PresenceUser[]);
      });

      // 3. Debounced autosave back to Postgres. Stashed in a ref (not
      // just returned from this async function) because a `return`
      // inside an async IIFE only resolves that function's own promise —
      // nobody was awaiting it, so the previous version of this hook
      // silently discarded it and never actually detached the listener
      // on unmount.
      detachAutosaveRef.current = attachAutosave(
        supabase,
        doc,
        table === "doc_snapshots"
          ? { table, sessionId, docId }
          : { table, sessionId }
      );

      setReady(true);
    })();

    return () => {
      cancelled = true;
      detachAutosaveRef.current?.();
      providerRef.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, docId]);

  return { doc: docRef.current, provider: providerRef.current, ready, peers };
}
