/**
 * Author: Ali Quraishi
 *
 * Bridges a Y.Doc to durable storage in Postgres (via Supabase).
 *
 * We do NOT write to the DB on every keystroke — that would be one write
 * per update event, which is both wasteful and a good way to hit Supabase
 * rate limits in a busy session. Instead:
 *
 *   1. On mount, pull the last saved snapshot and apply it before the
 *      live Realtime channel connects, so a rejoining/late client starts
 *      from where the session left off instead of an empty doc.
 *   2. After that, debounce local edits and upsert the full encoded state
 *      (Y.encodeStateAsUpdate) on a trailing timer. Full-state snapshots
 *      (rather than incremental diffs) keep the recovery path simple: to
 *      restore, you just load one row and call Y.applyUpdate once.
 */
import * as Y from "yjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Table = "doc_snapshots" | "whiteboard_snapshots";

export async function loadSnapshot(
  client: SupabaseClient<Database>,
  doc: Y.Doc,
  opts: { table: "doc_snapshots"; sessionId: string; docId: string } | { table: "whiteboard_snapshots"; sessionId: string }
) {
  const query =
    opts.table === "doc_snapshots"
      ? client
          .from("doc_snapshots")
          .select("state")
          .eq("session_id", opts.sessionId)
          .eq("doc_id", opts.docId)
          .maybeSingle()
      : client
          .from("whiteboard_snapshots")
          .select("state")
          .eq("session_id", opts.sessionId)
          .maybeSingle();

  const { data, error } = await query;
  if (error) {
    console.error(`[persistence] failed to load ${opts.table} snapshot`, error);
    return;
  }
  if (!data?.state) return; // brand-new session, nothing to restore

  try {
    const bytes = base64ToBytes(data.state);
    Y.applyUpdate(doc, bytes, "snapshot-load");
  } catch (err) {
    // A corrupted or unreadable snapshot should degrade to "start from
    // an empty doc", not take down the whole session load.
    console.error(`[persistence] snapshot for ${opts.table} was corrupted or unreadable — starting empty`, err);
  }
}

export function attachAutosave(
  client: SupabaseClient<Database>,
  doc: Y.Doc,
  opts: { table: "doc_snapshots"; sessionId: string; docId: string; debounceMs?: number } | {
    table: "whiteboard_snapshots";
    sessionId: string;
    debounceMs?: number;
  }
) {
  const debounceMs = opts.debounceMs ?? 3000;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let saving = false;

  const save = async () => {
    if (saving) return; // a save is already in flight; the next update will trigger another
    saving = true;
    try {
      const state = bytesToBase64(Y.encodeStateAsUpdate(doc));
      if (opts.table === "doc_snapshots") {
        const { error } = await client
          .from("doc_snapshots")
          .upsert(
            { session_id: opts.sessionId, doc_id: opts.docId, state, updated_at: new Date().toISOString() },
            { onConflict: "session_id,doc_id" }
          );
        if (error) console.error("[persistence] doc autosave failed", error);
      } else {
        const { error } = await client
          .from("whiteboard_snapshots")
          .upsert(
            { session_id: opts.sessionId, state, updated_at: new Date().toISOString() },
            { onConflict: "session_id" }
          );
        if (error) console.error("[persistence] whiteboard autosave failed", error);
      }
    } finally {
      saving = false;
    }
  };

  const handler = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, debounceMs);
  };

  doc.on("update", handler);

  // Best-effort flush on tab close so the last few seconds of edits aren't lost.
  const flushOnUnload = () => {
    if (timer) clearTimeout(timer);
    save();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", flushOnUnload);
  }

  return () => {
    doc.off("update", handler);
    if (timer) clearTimeout(timer);
    if (typeof window !== "undefined") {
      window.removeEventListener("beforeunload", flushOnUnload);
    }
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
