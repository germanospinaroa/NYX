-- Fix the E.164 destination constraint only.
-- Forward-only. Do not edit or re-run migrations already applied remotely.

alter table public.messages
  drop constraint if exists messages_destination_check;

alter table public.messages
  add constraint messages_destination_check
  check (destination ~ '^\+[1-9][0-9]{7,14}$');
