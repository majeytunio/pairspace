/**
 * Author: Ali Quraishi
 */
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewSessionForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [language, setLanguage] = useState<"javascript" | "python">("javascript");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name || "Untitled session", language }),
    });
    setSubmitting(false);
    if (res.ok) {
      const { id } = await res.json();
      router.push(`/session/${id}`);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 rounded-md border border-line bg-white p-3">
      <input
        placeholder="Session name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="flex-1 rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-signal"
      />
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value as "javascript" | "python")}
        className="rounded-md border border-line px-2 py-2 text-sm"
      >
        <option value="javascript">JavaScript</option>
        <option value="python">Python</option>
      </select>
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-signal px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {submitting ? "Creating…" : "New session"}
      </button>
    </form>
  );
}
