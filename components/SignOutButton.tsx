/**
 * Author: Ali Quraishi
 */
"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <button
      onClick={handleSignOut}
      className="rounded-md border border-line px-2.5 py-1 text-xs text-ink/60 hover:text-ink"
    >
      Sign out
    </button>
  );
}
