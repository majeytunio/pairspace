# PairSpace

Remote pair programming and dynamic whiteboarding, built on **Next.js 14** and **Supabase** only.

**Author:** Ali Quraishi

## What's here

- **Conflict-free multi-user editing** — [Yjs](https://docs.yjs.dev/) CRDTs, not OT. There's no
  central transform server (Supabase has no long-running compute process to hold one), so every
  client merges updates independently and convergently. See `lib/yjs/supabase-provider.ts` for the
  custom Yjs↔Supabase Realtime bridge — there's no official one, so this project writes it.
- **Active session state persistence** — Yjs document state is snapshotted to Postgres
  (`doc_snapshots`, `whiteboard_snapshots`) on a debounce, and restored when a client joins. Live
  ephemeral state (who's online, cursors) lives in Supabase Presence, not the database. See
  `lib/yjs/persistence.ts`.
- **Real-time execution sandbox** — runs entirely in the browser: Python via Pyodide (WASM
  CPython), JavaScript in a sandboxed `<iframe sandbox="allow-scripts">` with no
  `allow-same-origin`. Supabase has no container/VM isolation primitive, so this is the only way
  to execute arbitrary session code safely while staying Supabase-only for the backend. See
  `components/Sandbox.tsx` for the reasoning and implementation.

## Setup

1. **Create a Supabase project**, then run `supabase/schema.sql` in the SQL editor (or
   `supabase db push` if you're using the CLI). It creates all tables, RLS policies, and triggers.

   > **Already ran an earlier version of this schema?** The `doc_snapshots.state` and
   > `whiteboard_snapshots.state` columns used to be `bytea`, which breaks on read because
   > Postgres's default `bytea_output` is hex, not base64, and the client decodes with `atob()`
   > expecting base64. Run `supabase/migrations/001_snapshots_bytea_to_text.sql` once to convert
   > the existing columns (and data) to `text` in place. New projects created from the current
   > `schema.sql` don't need this — they already use `text`.
2. **Enable Email + Password auth** in Supabase Auth settings (Authentication → Providers →
   Email). If you want new accounts to be able to sign in immediately without clicking a
   confirmation email, turn off "Confirm email" there too — otherwise `signUp` will require the
   user to confirm before their first sign-in.
3. Copy `.env.example` to `.env.local` and fill in your project URL + anon key:
   ```
   cp .env.example .env.local
   ```
4. Install and run:
   ```
   npm install
   npm run dev
   ```
5. Open `http://localhost:3000`, sign in via the emailed magic link, and create a session.

## Project layout

```
app/
  page.tsx                 dashboard: list + create sessions
  login/page.tsx           magic-link sign-in
  session/[id]/page.tsx    session shell (server component, loads session + user)
  api/session/route.ts     create/list sessions
  api/session/[id]/route.ts  fetch one session, join as participant

components/
  SessionWorkspace.tsx     tabs (editor/whiteboard), presence bar, sandbox panel
  Editor.tsx               CodeMirror bound to Yjs via y-codemirror.next
  Whiteboard.tsx           tldraw bound to a Yjs Y.Map
  Sandbox.tsx              in-browser code execution (Pyodide / sandboxed iframe)
  PresenceBar.tsx          online-peer avatars

lib/
  yjs/supabase-provider.ts   Yjs <-> Supabase Realtime broadcast bridge
  yjs/persistence.ts         snapshot load/autosave to Postgres
  yjs/useSessionDoc.ts       hook wiring doc + provider + persistence + presence
  supabase/client.ts         browser Supabase client
  supabase/server.ts         server Supabase client (Route Handlers / Server Components)

supabase/schema.sql        tables, RLS policies, triggers
```

## How the CRDT sync works, end to end

1. Each editor/whiteboard document is a `Y.Doc`. `SupabaseYjsProvider` (in
   `lib/yjs/supabase-provider.ts`) opens one Supabase Realtime channel per document
   (`session:{sessionId}:{docId}`) and:
   - broadcasts local `Y.Doc` updates (debounced ~80ms, merged into one payload) as base64 over
     the channel;
   - applies incoming updates from peers with `Y.applyUpdate`, tagging them with a local origin so
     they don't get re-broadcast (no echo loops);
   - on connect, asks the room for a fresh sync so a late joiner catches up.
2. Presence/awareness (cursor position, name, color) rides on the same channel as its own
   broadcast event, decoded through `y-protocols/awareness`.
3. `lib/yjs/persistence.ts` debounces a full-state snapshot (`Y.encodeStateAsUpdate`) to Postgres
   every few seconds, and loads the last snapshot before the live channel connects — so reloading
   the page or rejoining later picks up where the session left off.

## Known trade-offs worth knowing about

- **Realtime broadcast has no persistence or ordering guarantee.** This is fine for Yjs, because
  CRDT updates are commutative — but it does mean you're relying on Supabase's Realtime uptime
  for live sync; the Postgres snapshots are your durability backstop.
- **The sandbox is browser-side only**, so it can't do things a real server sandbox could
  (arbitrary system calls, non-WASM-friendly languages, network access from the executed code).
  If you need that, you'd bring in an external execution API (e.g. Piston, Judge0, e2b.dev) from
  an Edge Function — but that's no longer "Supabase only" for compute, which is why it's not in
  this build by default.
- **RLS treats "editor" and "viewer" the same at the database row level** for doc/whiteboard
  writes, because CRDT merges don't carry per-write intent. If you need to actually enforce
  view-only access, gate it in the UI (disable the editor) and consider a Postgres function that
  inspects `session_participants.role` before accepting a snapshot write.
