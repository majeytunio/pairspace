/**
 * Author: Ali Quraishi
 *
 * Browser-side Supabase client. Uses the anon key only — safe to import
 * into any client component.
 *
 * This is a module-level singleton rather than a fresh client per call.
 * Previously every call to createClient() created a brand-new
 * SupabaseClient — and therefore a brand-new Realtime WebSocket socket.
 * useSessionDoc calls this once for the editor doc and once for the
 * whiteboard doc, so a session page was opening two separate sockets per
 * browser tab for no reason. Sharing one client means one socket, whose
 * eventsPerSecond budget (bumped below) is shared cleanly across both
 * Yjs channels instead of being split arbitrarily by which doc happened
 * to connect first.
 */
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function createClient() {
  if (!browserClient) {
    browserClient = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        realtime: {
          params: {
            // Default is 10. Freehand whiteboard drawing can generate a
            // burst of many small Yjs updates per second even after
            // debouncing (see supabase-provider.ts) — this gives that
            // burst headroom instead of running into the client's own
            // throttle before the message even leaves the browser.
            eventsPerSecond: 30,
          },
        },
      }
    );
  }
  return browserClient;
}
