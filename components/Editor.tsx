/**
 * Author: Ali Quraishi
 *
 * Collaborative code editor. Multi-cursor, conflict-free editing comes
 * from binding CodeMirror directly to the Yjs XmlFragment/Text type via
 * y-codemirror.next's `yCollab` extension — CodeMirror never touches the
 * network itself, it just reflects whatever the CRDT converges to.
 */
"use client";

import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, basicSetup } from "codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { yCollab } from "y-codemirror.next";
import type * as Y from "yjs";
import type { SupabaseYjsProvider } from "@/lib/yjs/supabase-provider";

type EditorProps = {
  doc: Y.Doc;
  provider: SupabaseYjsProvider | undefined;
  language: "javascript" | "python";
  ready: boolean;
};

const languageExtension = {
  javascript: javascript(),
  python: python(),
};

export default function Editor({ doc, provider, language, ready }: EditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView>();

  useEffect(() => {
    if (!ready || !provider || !hostRef.current) return;

    const yText = doc.getText("codemirror");

    const state = EditorState.create({
      doc: yText.toString(),
      extensions: [
        basicSetup,
        languageExtension[language],
        yCollab(yText, provider.awareness),
        EditorView.theme({
          "&": { height: "100%", fontSize: "13.5px" },
          ".cm-scroller": { fontFamily: "var(--font-mono, monospace)", overflow: "auto" },
        }),
      ],
    });

    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = undefined;
    };
  }, [doc, provider, language, ready]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-md border border-line bg-[#1b1e21]">
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-paper/60">
          Loading editor…
        </div>
      )}
      <div ref={hostRef} className="h-full w-full" />
    </div>
  );
}
