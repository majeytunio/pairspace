-- Migration: fix doc/whiteboard snapshot columns from bytea to text
-- Author: Ali Quraishi
--
-- Run this once against a project that already has schema.sql applied
-- with the old `bytea` column type. It converts existing rows in place —
-- `encode(state, 'base64')` turns whatever bytes are already stored back
-- into the same base64 string the client originally sent, so no data is
-- lost. New rows written after this migration go through the app's
-- normal base64-text path and need no further conversion.

alter table public.doc_snapshots
  alter column state type text using encode(state, 'base64');

alter table public.whiteboard_snapshots
  alter column state type text using encode(state, 'base64');
