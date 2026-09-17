/**
 * Author: Ali Quraishi
 *
 * Real-time execution sandbox.
 *
 * IMPORTANT CONSTRAINT: Supabase has no server-side compute isolation
 * primitive (no container/VM runtime), so "Supabase only" rules out
 * running arbitrary user code on the backend safely. This component
 * executes entirely in the browser instead:
 *
 *   - Python runs via Pyodide (CPython compiled to WASM), loaded from
 *     its CDN on first run and cached by the browser after that.
 *   - JavaScript runs inside a sandboxed <iframe sandbox="allow-scripts">
 *     with no `allow-same-origin`, so the executed code cannot reach
 *     this page's DOM, cookies, or Supabase session — only postMessage
 *     gets console output back out.
 *
 * Every run is logged to `sandbox_runs` for the session's history, but
 * the code never touches a server process to run.
 */
"use client";

import { useCallback, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type RunResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
};

type SandboxProps = {
  sessionId: string;
  docId: string;
  language: "javascript" | "python";
  getCode: () => string;
  userId: string;
};

declare global {
  interface Window {
    loadPyodide?: (opts: { indexURL: string }) => Promise<any>;
  }
}

const PYODIDE_CDN = "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/";

export default function Sandbox({ sessionId, docId, language, getCode, userId }: SandboxProps) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const pyodideRef = useRef<any>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const runPython = useCallback(async (code: string): Promise<RunResult> => {
    const started = performance.now();

    if (!pyodideRef.current) {
      if (!window.loadPyodide) {
        await loadScript(`${PYODIDE_CDN}pyodide.js`);
      }
      pyodideRef.current = await window.loadPyodide!({ indexURL: PYODIDE_CDN });
    }
    const pyodide = pyodideRef.current;

    let stdout = "";
    let stderr = "";
    pyodide.setStdout({ batched: (s: string) => (stdout += s + "\n") });
    pyodide.setStderr({ batched: (s: string) => (stderr += s + "\n") });

    let exitCode = 0;
    try {
      await pyodide.runPythonAsync(code);
    } catch (err: any) {
      stderr += String(err?.message ?? err) + "\n";
      exitCode = 1;
    }

    return { stdout, stderr, exitCode, durationMs: Math.round(performance.now() - started) };
  }, []);

  const runJavaScript = useCallback((code: string): Promise<RunResult> => {
    const started = performance.now();
    return new Promise((resolve) => {
      const iframe = document.createElement("iframe");
      iframe.sandbox.add("allow-scripts"); // deliberately NOT allow-same-origin
      iframe.style.display = "none";
      document.body.appendChild(iframe);
      iframeRef.current = iframe;

      const logs: string[] = [];
      const errors: string[] = [];

      const cleanup = () => {
        window.removeEventListener("message", onMessage);
        iframe.remove();
      };

      const onMessage = (event: MessageEvent) => {
        if (event.source !== iframe.contentWindow) return;
        const { type, payload } = event.data ?? {};
        if (type === "log") logs.push(payload);
        if (type === "error") errors.push(payload);
        if (type === "done") {
          cleanup();
          resolve({
            stdout: logs.join("\n"),
            stderr: errors.join("\n"),
            exitCode: errors.length ? 1 : 0,
            durationMs: Math.round(performance.now() - started),
          });
        }
      };
      window.addEventListener("message", onMessage);

      const runnerHtml = buildSandboxIframeSrc(code);
      iframe.srcdoc = runnerHtml;

      // Hard timeout so an infinite loop in a peer's code can't hang the tab forever.
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          cleanup();
          resolve({ stdout: logs.join("\n"), stderr: "Execution timed out after 5s", exitCode: 124, durationMs: 5000 });
        }
      }, 5000);
    });
  }, []);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setResult(null);
    const code = getCode();

    const run = language === "python" ? await runPython(code) : await runJavaScript(code);
    setResult(run);
    setRunning(false);

    const supabase = createClient();
    await supabase.from("sandbox_runs").insert({
      session_id: sessionId,
      doc_id: docId,
      triggered_by: userId,
      language,
      stdout: run.stdout,
      stderr: run.stderr,
      exit_code: run.exitCode,
      duration_ms: run.durationMs,
    });
  }, [docId, getCode, language, runJavaScript, runPython, sessionId, userId]);

  return (
    <div className="flex h-full flex-col rounded-md border border-line bg-white">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="text-xs font-medium text-ink/70">Run ({language})</span>
        <button
          onClick={handleRun}
          disabled={running}
          className="rounded bg-signal px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          {running ? "Running…" : "Run"}
        </button>
      </div>
      <div className="flex-1 overflow-auto p-3 font-mono text-xs">
        {result ? (
          <>
            {result.stdout && <pre className="whitespace-pre-wrap text-ink">{result.stdout}</pre>}
            {result.stderr && <pre className="whitespace-pre-wrap text-flag">{result.stderr}</pre>}
            <div className="mt-2 text-ink/40">
              exit {result.exitCode} · {result.durationMs}ms
            </div>
          </>
        ) : (
          <span className="text-ink/40">Output will appear here.</span>
        )}
      </div>
    </div>
  );
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

/**
 * Builds the isolated document that actually runs the untrusted JS.
 * console.log/error are shimmed to postMessage instead of touching the
 * real console, and the iframe has no allow-same-origin, so it cannot
 * read this page's cookies, localStorage, or Supabase auth token.
 */
function buildSandboxIframeSrc(userCode: string): string {
  const escaped = userCode.replace(/<\/script>/gi, "<\\/script>");
  return `<!doctype html><html><body><script>
    const send = (type, payload) => parent.postMessage({ type, payload }, "*");
    console.log = (...args) => send("log", args.map(String).join(" "));
    console.error = (...args) => send("error", args.map(String).join(" "));
    window.onerror = (msg) => { send("error", String(msg)); send("done", null); };
    try {
      ${escaped}
      send("done", null);
    } catch (e) {
      send("error", String(e && e.message ? e.message : e));
      send("done", null);
    }
  </script></body></html>`;
}
