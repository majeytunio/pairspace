/**
 * Author: Ali Quraishi
 */
"use client";

import type { PresenceUser } from "@/lib/yjs/useSessionDoc";

export default function PresenceBar({ peers, connected }: { peers: PresenceUser[]; connected: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5">
        <span
          className={`h-2 w-2 rounded-full ${connected ? "bg-signal" : "bg-flag"}`}
          aria-hidden
        />
        <span className="text-xs text-ink/60">{connected ? "Live" : "Connecting…"}</span>
      </div>
      <div className="flex -space-x-2">
        {peers.map((p) => (
          <div
            key={p.userId}
            title={p.name}
            className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-paper text-[11px] font-medium text-white"
            style={{ backgroundColor: p.color }}
          >
            {p.name.slice(0, 1).toUpperCase()}
          </div>
        ))}
      </div>
      {peers.length === 0 && <span className="text-xs text-ink/40">No one else here yet</span>}
    </div>
  );
}
