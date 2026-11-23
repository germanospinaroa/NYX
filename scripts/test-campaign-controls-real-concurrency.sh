#!/usr/bin/env bash
set -euo pipefail

# Runs the actual RPCs from the campaign-controls migration against a dedicated
# PostgreSQL database. The caller must create and destroy that database; this
# script never accepts or contacts the production Supabase project implicitly.
database_url=${NYX_REAL_CONCURRENCY_DATABASE_URL:-}
if [[ -z "$database_url" ]]; then
  echo 'SKIP: NYX_REAL_CONCURRENCY_DATABASE_URL is not configured' >&2
  exit 2
fi

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
psql_args=("$database_url" -X -v ON_ERROR_STOP=1 -qAt)
run_sql() { psql "${psql_args[@]}" -c "set statement_timeout = '5s'; $1"; }

psql "${psql_args[@]}" <<'SQL'
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select '00000000-0000-0000-0000-000000000001'::uuid
$$;
create or replace function public.resolve_campaign_template(text, text, text)
returns text language sql immutable as $$ select $1 $$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end
$$;

create table public.campaigns (
  id uuid primary key, owner_id uuid not null, name text, status text not null,
  pause_requested boolean not null default false, scheduled_at timestamptz,
  started_at timestamptz, completed_at timestamptz
);
create table public.message_sequences (
  id uuid primary key, campaign_id uuid, owner_id uuid not null, status text not null
);
create table public.campaign_sequence_steps (
  id uuid primary key, campaign_id uuid, owner_id uuid not null
);
create table public.campaign_recipients (
  id uuid primary key, campaign_id uuid, owner_id uuid not null, status text not null
);
create table public.messages (
  id uuid primary key, campaign_id uuid, campaign_recipient_id uuid,
  owner_id uuid not null, sequence_id uuid, sequence_index integer,
  status text not null, available_at timestamptz not null default now(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  claimed_at timestamptz, attempt_count integer not null default 0
);
SQL

psql "${psql_args[@]}" -f "$repo_root/supabase/migrations/20261123120000_campaign_controls_and_editing.sql" >/dev/null

owner='00000000-0000-0000-0000-000000000001'
campaign_one='00000000-0000-0000-0000-000000000101'
campaign_two='00000000-0000-0000-0000-000000000102'
run_sql "insert into public.campaigns(id, owner_id, status) values ('$campaign_one', '$owner', 'QUEUED'), ('$campaign_two', '$owner', 'QUEUED');
insert into public.messages(id, campaign_id, owner_id, status) select ('00000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, '$campaign_one', '$owner', 'QUEUED' from generate_series(101,103) g;
insert into public.messages(id, campaign_id, owner_id, status) select ('00000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, '$campaign_two', '$owner', 'QUEUED' from generate_series(201,203) g;" >/dev/null

# Two concurrent workers, then a follow-up claim for rows skipped while locks
# were held. The attempt counter proves that no row was claimed twice.
run_sql "select count(*) from public.claim_outbox_batch(3)" >/dev/null & worker_one=$!
run_sql "select count(*) from public.claim_outbox_batch(3)" >/dev/null & worker_two=$!
wait "$worker_one"
wait "$worker_two"
run_sql "select count(*) from public.claim_outbox_batch(20)" >/dev/null
claimed=$(run_sql "select count(*) from public.messages where status = 'SENDING' and attempt_count = 1")
total=$(run_sql "select count(*) from public.messages")
[[ "$claimed" == "$total" ]] || { echo "FAIL: duplicate/lost claim count ($claimed/$total)" >&2; exit 1; }

# RELEASE serializes with cancellation and preserves the terminal state.
run_sql "update public.messages set status='SENDING', claimed_at=now() where id=(select id from public.messages where campaign_id='$campaign_one' limit 1); update public.campaigns set status='CANCELLED', pause_requested=false where id='$campaign_one';"
released=$(run_sql "select public.release_claimed_message((select id from public.messages where campaign_id='$campaign_one' and status='SENDING' limit 1))")
[[ "$released" == 'CANCELLED' ]] || { echo "FAIL: release after cancellation returned $released" >&2; exit 1; }

# CANCEL preserves SENT/SENDING and cancels only pending QUEUED rows.
run_sql "update public.campaigns set status='RUNNING', pause_requested=false where id='$campaign_two'; update public.messages set status=case when id in (select id from public.messages where campaign_id='$campaign_two' order by id limit 1) then 'SENT' when id in (select id from public.messages where campaign_id='$campaign_two' order by id offset 1 limit 1) then 'SENDING' else 'QUEUED' end, claimed_at=case when id in (select id from public.messages where campaign_id='$campaign_two' order by id offset 1 limit 1) then now() else null end where campaign_id='$campaign_two'; select public.cancel_campaign('$campaign_two');" >/dev/null
cancel_state=$(run_sql "select string_agg(status, ',' order by id) from public.messages where campaign_id='$campaign_two'")
[[ "$cancel_state" == 'SENT,SENDING,CANCELLED' ]] || { echo "FAIL: cancel state $cancel_state" >&2; exit 1; }

# PAUSE before CLAIM and PAUSE waiting for a claim-held campaign lock.
run_sql "update public.campaigns set status='QUEUED', pause_requested=false where id='$campaign_one'; update public.messages set status='QUEUED', attempt_count=0, claimed_at=null where campaign_id='$campaign_one'; select public.pause_campaign('$campaign_one');" >/dev/null
pause_claim=$(run_sql "select count(*) from public.claim_outbox_batch(20)")
[[ "$pause_claim" == '0' ]] || { echo "FAIL: paused campaign claimed messages" >&2; exit 1; }
run_sql "update public.campaigns set status='QUEUED', pause_requested=false where id='$campaign_one'; update public.messages set status='QUEUED', attempt_count=0, claimed_at=null where campaign_id='$campaign_one';" >/dev/null
(run_sql "begin; select count(*) from public.claim_outbox_batch(1); select pg_sleep(0.5); commit" >/dev/null) & claim_pid=$!
sleep 0.1
(run_sql "select public.pause_campaign('$campaign_one')" >/dev/null) & pause_pid=$!
wait "$claim_pid"
wait "$pause_pid"
post_pause_claim=$(run_sql "select count(*) from public.claim_outbox_batch(20)")
[[ "$post_pause_claim" == '0' ]] || { echo "FAIL: claim proceeded after in-flight pause" >&2; exit 1; }

remaining=$(run_sql "select count(*) from public.messages where status='QUEUED' and campaign_id='$campaign_one'")
[[ "$remaining" -gt 0 ]] || { echo 'FAIL: pause/cancel test lost pending messages' >&2; exit 1; }
echo 'PASS: real migration RPC concurrency, two workers, cancel, pause, release, and bounded waits'
