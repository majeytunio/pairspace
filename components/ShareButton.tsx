// components/ShareButton.tsx
"use client";
import { useState } from "react";

export default function ShareButton() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded-md border border-line px-2.5 py-1 text-xs text-ink/60 hover:text-ink"
    >
      {copied ? "Copied!" : "Copy invite link"}
    </button>
  );
}