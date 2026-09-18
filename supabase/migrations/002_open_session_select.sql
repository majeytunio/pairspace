-- Migration: allow any signed-in user to read a session by id
-- Author: Ali Quraishi
--
-- The original sessions_select policy required existing session
-- membership to read the row at all. That's a chicken-and-egg lock: the
-- app only adds someone as a participant AFTER successfully reading the
-- session, so nobody but the owner could ever get past that check. This
-- is the actual reason an invited user saw a blank board with no
-- visibility into the inviter's work — they were silently blocked from
-- loading the session in the first place, well before any Yjs/Realtime
-- sync logic ever ran.
--
-- Run this once against a project that already has the old policy.

drop policy if exists sessions_select on public.sessions;

create policy sessions_select on public.sessions
  for select using (auth.uid() is not null);
