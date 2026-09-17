/**
 * Author: Ali Quraishi
 *
 * Browser-side Supabase client. Uses the anon key only — safe to import
 * into any client component.
 */
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
