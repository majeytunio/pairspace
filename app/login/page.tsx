/**
 * Author: Ali Quraishi
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSubmitting(true);

    const supabase = createClient();

    if (mode === "sign-in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setSubmitting(false);
      if (error) {
        setError(error.message);
        return;
      }
      router.push("/");
      router.refresh();
      return;
    }

    // sign-up
    const { data, error } = await supabase.auth.signUp({ email, password });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (data.session) {
      // Email confirmation is off in this Supabase project — signed in immediately.
      router.push("/");
      router.refresh();
    } else {
      // Email confirmation is on — Supabase sent a confirmation link.
      setNotice("Account created. Check your email to confirm it, then sign in.");
      setMode("sign-in");
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold text-ink">
          {mode === "sign-in" ? "Sign in to PairSpace" : "Create your PairSpace account"}
        </h1>
        <p className="mt-1 text-sm text-ink/60">
          {mode === "sign-in" ? "Enter your email and password." : "Pick an email and password."}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-signal"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Password"
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-signal"
          />
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-signal px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? "Please wait…" : mode === "sign-in" ? "Sign in" : "Create account"}
          </button>

          {error && <p className="text-sm text-flag">{error}</p>}
          {notice && <p className="text-sm text-signal">{notice}</p>}
        </form>

        <button
          onClick={() => {
            setMode(mode === "sign-in" ? "sign-up" : "sign-in");
            setError(null);
            setNotice(null);
          }}
          className="mt-4 text-sm text-ink/60 underline underline-offset-2"
        >
          {mode === "sign-in" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}
