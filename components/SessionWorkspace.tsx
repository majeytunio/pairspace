/**
 * Author: Ali Quraishi
 */
"use client";

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSessionDoc, type PresenceUser } from "@/lib/yjs/useSessionDoc";
import PresenceBar from "@/components/PresenceBar";
import Sandbox from "@/components/Sandbox";
import ShareButton from "@/components/ShareButton";

// tldraw pulls in browser-only APIs; load it client-side only.
const Whiteboard = dynamic(() => import("@/components/Whiteboard"), { ssr: false });
const Editor = dynamic(() => import("@/components/Editor"), { ssr: false });

type SessionWorkspaceProps = {
  sessionId: string;
  sessionName: string;
  language: "javascript" | "python";
  user: PresenceUser;
};

export default function SessionWorkspace({ sessionId, sessionName, language, user }: SessionWorkspaceProps) {
  const [view, setView] = useState<"code" | "board">("code");
  const codeRef = useRef<() => string>(() => "");

  const editorSession = useSessionDoc({ sessionId, docId: "main", table: "doc_snapshots", user });
  const boardSession = useSessionDoc({ sessionId, docId: "whiteboard", table: "whiteboard_snapshots", user });

  const getCode = useCallback(() => {
    return editorSession.doc.getText("codemirror").toString();
  }, [editorSession.doc]);

  return (
    <main className="flex h-screen flex-col bg-paper">
      <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-semibold text-ink">{sessionName}</h1>
          <nav className="flex gap-1 rounded-md bg-white p-0.5">
            {(["code", "board"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded px-3 py-1 text-xs font-medium ${
                  view === v ? "bg-signal text-white" : "text-ink/60 hover:text-ink"
                }`}
              >
                {v === "code" ? "Editor" : "Whiteboard"}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <PresenceBar
            peers={view === "code" ? editorSession.peers : boardSession.peers}
            connected={(view === "code" ? editorSession.provider : boardSession.provider)?.isConnected ?? false}
          />
          <ShareButton />
        </div>
      </header>

      <div className="flex flex-1 gap-3 overflow-hidden p-3">
        <section className="flex-1 overflow-hidden">
          {view === "code" ? (
            <Editor
              doc={editorSession.doc}
              provider={editorSession.provider}
              language={language}
              ready={editorSession.ready}
            />
          ) : (
            <Whiteboard doc={boardSession.doc} provider={boardSession.provider} ready={boardSession.ready} />
          )}
        </section>

        {view === "code" && (
          <aside className="w-80 shrink-0">
            <Sandbox
              sessionId={sessionId}
              docId="main"
              language={language}
              getCode={getCode}
              userId={user.userId}
            />
          </aside>
        )}
      </div>
    </main>
  );
}