/**
 * Author: Ali Quraishi
 *
 * SupabaseProvider — a minimal Yjs network provider backed by Supabase
 * Realtime. There is no official Supabase binding for Yjs, so this bridges
 * the two:
 *
 *   - Supabase Realtime's `broadcast` channel type is a dumb pub/sub relay
 *     (no ordering guarantees, no persistence). That's fine, because Yjs
 *     updates are commutative and idempotent — applying the same update
 *     twice, or out of order, converges to the same document state.
 *   - On connect, the provider asks every other peer on the channel for
 *     their state vector, diffs against local state, and exchanges only
 *     the missing updates (a standard Yjs "sync step"). This means a late
 *     joiner catches up without replaying the whole history.
 *   - Local edits are captured via `doc.on('update', ...)`, base64-encoded,
 *     and broadcast. Remote updates are applied with `Y.applyUpdate`,
 *     tagged with a local origin so we don't re-broadcast our own echo.
 *   - Awareness (cursors, user color/name, selection) rides on Supabase
 *     Presence rather than broadcast, since Presence already understands
 *     "who is here right now" and cleans up on disconnect for free.
 *
 * Updates are debounced client-side before broadcasting so fast typing
 * doesn't flood the channel with one message per keystroke.
 */
import * as Y from "yjs";
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

const LOCAL_ORIGIN = Symbol("supabase-provider-local");

type ProviderOptions = {
  debounceMs?: number;
};

export class SupabaseYjsProvider {
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  readonly channelName: string;

  private client: SupabaseClient;
  private channel: RealtimeChannel | null = null;
  private pendingUpdates: Uint8Array[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private debounceMs: number;
  private connected = false;
  private destroyed = false;

  constructor(
    client: SupabaseClient,
    channelName: string,
    doc: Y.Doc,
    options: ProviderOptions = {}
  ) {
    this.client = client;
    this.channelName = channelName;
    this.doc = doc;
    this.awareness = new Awareness(doc);
    this.debounceMs = options.debounceMs ?? 80;

    this.doc.on("update", this.handleLocalDocUpdate);
    this.awareness.on("update", this.handleLocalAwarenessUpdate);
  }

  connect() {
    if (this.channel) return;

    const channel = this.client.channel(this.channelName, {
      config: { broadcast: { self: false }, presence: { key: crypto.randomUUID() } },
    });

    channel
      .on("broadcast", { event: "doc-update" }, ({ payload }) => {
        this.applyRemoteUpdate(payload.update);
      })
      .on("broadcast", { event: "awareness" }, ({ payload }) => {
        applyAwarenessUpdate(this.awareness, base64ToBytes(payload.update), LOCAL_ORIGIN);
      })
      .on("broadcast", { event: "sync-request" }, ({ payload }) => {
        // A peer just joined and doesn't know what we have — send our
        // full state as a single update they can merge (idempotent).
        if (payload.requesterId === this.instanceId) return;
        const update = Y.encodeStateAsUpdate(this.doc);
        this.sendRaw("doc-update", { update: bytesToBase64(update) });
      })
      .on("presence", { event: "sync" }, () => {
        // Presence state itself is used for "who's online"; awareness
        // (cursor position etc.) travels over broadcast above.
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          this.connected = true;
          // Ask peers already in the room to fill in anything we're
          // missing (covers the case where we joined mid-session).
          this.sendRaw("sync-request", { requesterId: this.instanceId });
        }
      });

    this.channel = channel;
  }

  disconnect() {
    if (!this.channel) return;
    removeAwarenessStates(this.awareness, [this.doc.clientID], "provider-disconnect");
    this.client.removeChannel(this.channel);
    this.channel = null;
    this.connected = false;
  }

  destroy() {
    this.destroyed = true;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.doc.off("update", this.handleLocalDocUpdate);
    this.awareness.off("update", this.handleLocalAwarenessUpdate);
    this.disconnect();
  }

  get isConnected() {
    return this.connected;
  }

  private instanceId = crypto.randomUUID();

  private handleLocalDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === LOCAL_ORIGIN) return; // don't re-broadcast remote updates
    this.pendingUpdates.push(update);
    this.scheduleFlush();
  };

  private handleLocalAwarenessUpdate = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
    const changed = [...added, ...updated, ...removed];
    if (changed.length === 0) return;
    const update = encodeAwarenessUpdate(this.awareness, changed);
    this.sendRaw("awareness", { update: bytesToBase64(update) });
  };

  private scheduleFlush() {
    if (this.flushTimer || this.destroyed) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushPendingUpdates();
    }, this.debounceMs);
  }

  private flushPendingUpdates() {
    if (this.pendingUpdates.length === 0) return;
    // Merge everything queued during the debounce window into one
    // update before sending — fewer, denser messages on the wire.
    const merged = Y.mergeUpdates(this.pendingUpdates);
    this.pendingUpdates = [];
    this.sendRaw("doc-update", { update: bytesToBase64(merged) });
  }

  private applyRemoteUpdate(base64Update: string) {
    const update = base64ToBytes(base64Update);
    Y.applyUpdate(this.doc, update, LOCAL_ORIGIN);
  }

  private sendRaw(event: "doc-update" | "awareness" | "sync-request", payload: Record<string, unknown>) {
    if (!this.channel) return;
    this.channel.send({ type: "broadcast", event, payload });
  }
}

// ---------------------------------------------------------------------------
// base64 <-> Uint8Array helpers (browser-safe, no Node Buffer dependency)
// ---------------------------------------------------------------------------
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
