-- PairSpace database schema
-- Author: Ali Quraishi
--
-- Run this in the Supabase SQL editor, or via `supabase db push`.
-- Design notes:
--   - Yjs documents are stored as raw CRDT update bytes (bytea), produced by
--     Y.encodeStateAsUpdate(doc) on the client. Postgres never interprets the
--     content; it is an opaque, mergeable blob.
--   - "Active" session state (who's online, cursor positions) is intentionally
--     NOT stored here — that lives in Supabase Realtime Presence, which is
--     ephemeral by design. This schema only persists durable state:
--     session metadata + the last known CRDT snapshot for each doc.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------
create table if not exists public.sessions (
  id           uuid primary key default gen_random_uuid(),
  name         text not null default 'Untitled session',
  owner_id     uuid not null references auth.users (id) on delete cascade,
  language     text not null default 'javascript',
  created_at   timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  status       text not null default 'active' check (status in ('active', 'archived'))
);

create index if not exists sessions_owner_idx on public.sessions (owner_id);
create index if not exists sessions_last_active_idx on public.sessions (last_active_at desc);

-- ---------------------------------------------------------------------------
-- session_participants
-- ---------------------------------------------------------------------------
create table if not exists public.session_participants (
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  joined_at  timestamptz not null default now(),
  primary key (session_id, user_id)
);

create index if not exists participants_user_idx on public.session_participants (user_id);

-- ---------------------------------------------------------------------------
-- doc_snapshots  (one row per Yjs document per session; doc_id lets a
-- session hold more than one editor buffer, e.g. multiple files)
-- ---------------------------------------------------------------------------
create table if not exists public.doc_snapshots (
  session_id uuid not null references public.sessions (id) on delete cascade,
  doc_id     text not null default 'main',
  state      bytea not null,
  version    bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (session_id, doc_id)
);

-- ---------------------------------------------------------------------------
-- whiteboard_snapshots  (Yjs state for the tldraw/whiteboard document)
-- ---------------------------------------------------------------------------
create table if not exists public.whiteboard_snapshots (
  session_id uuid primary key references public.sessions (id) on delete cascade,
  state      bytea not null,
  version    bigint not null default 1,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- sandbox_runs  (history/log of code executions triggered in a session)
-- ---------------------------------------------------------------------------
create table if not exists public.sandbox_runs (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  doc_id     text not null default 'main',
  triggered_by uuid not null references auth.users (id) on delete set null,
  language   text not null,
  stdout     text,
  stderr     text,
  exit_code  int,
  duration_ms int,
  created_at timestamptz not null default now()
);

create index if not exists sandbox_runs_session_idx on public.sandbox_runs (session_id, created_at desc);

-- ---------------------------------------------------------------------------
-- housekeeping trigger: bump sessions.last_active_at whenever a doc changes
-- ---------------------------------------------------------------------------
create or replace function public.touch_session_activity()
returns trigger
language plpgsql
security definer
as $$
begin
  update public.sessions
    set last_active_at = now()
    where id = new.session_id;
  return new;
end;
$$;

drop trigger if exists trg_touch_session_on_doc on public.doc_snapshots;
create trigger trg_touch_session_on_doc
  after insert or update on public.doc_snapshots
  for each row execute function public.touch_session_activity();

drop trigger if exists trg_touch_session_on_board on public.whiteboard_snapshots;
create trigger trg_touch_session_on_board
  after insert or update on public.whiteboard_snapshots
  for each row execute function public.touch_session_activity();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.sessions enable row level security;
alter table public.session_participants enable row level security;
alter table public.doc_snapshots enable row level security;
alter table public.whiteboard_snapshots enable row level security;
alter table public.sandbox_runs enable row level security;

-- Helper: is the current user a participant (any role) of a session?
create or replace function public.is_session_member(target_session uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.session_participants sp
    where sp.session_id = target_session
      and sp.user_id = auth.uid()
  );
$$;

-- sessions: members can read; only the owner can update/delete; any
-- authenticated user can create a session (becoming its owner).
create policy sessions_select on public.sessions
  for select using (public.is_session_member(id) or owner_id = auth.uid());

create policy sessions_insert on public.sessions
  for insert with check (owner_id = auth.uid());

create policy sessions_update on public.sessions
  for update using (owner_id = auth.uid());

create policy sessions_delete on public.sessions
  for delete using (owner_id = auth.uid());

-- session_participants: members can see the roster; owners manage it;
-- a user can add themself (join) but not assign themself 'owner'.
create policy participants_select on public.session_participants
  for select using (public.is_session_member(session_id));

create policy participants_self_join on public.session_participants
  for insert with check (user_id = auth.uid() and role <> 'owner');

create policy participants_owner_manage on public.session_participants
  for all using (
    exists (
      select 1 from public.sessions s
      where s.id = session_id and s.owner_id = auth.uid()
    )
  );

-- doc_snapshots / whiteboard_snapshots / sandbox_runs: any session member
-- can read and write (viewers are restricted at the application layer,
-- since CRDT merges are commutative and Postgres can't easily distinguish
-- "editor" intent from "viewer" intent at the row level).
create policy docs_rw on public.doc_snapshots
  for all using (public.is_session_member(session_id))
  with check (public.is_session_member(session_id));

create policy whiteboard_rw on public.whiteboard_snapshots
  for all using (public.is_session_member(session_id))
  with check (public.is_session_member(session_id));

create policy sandbox_rw on public.sandbox_runs
  for all using (public.is_session_member(session_id))
  with check (public.is_session_member(session_id));
