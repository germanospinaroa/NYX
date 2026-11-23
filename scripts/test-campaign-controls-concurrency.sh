#!/usr/bin/env bash
set -euo pipefail

# Real two-session PostgreSQL harness. It uses an isolated schema and never
# connects to production unless the caller explicitly supplies a test URL.
database_url=${NYX_CONCURRENCY_DATABASE_URL:-}
if [[ -z "$database_url" ]]; then
  echo 'SKIP: NYX_CONCURRENCY_DATABASE_URL is not configured' >&2
  exit 2
fi

schema="nyx_concurrency_${$}_$(date +%s)"
tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/nyx-concurrency.XXXXXX")
trap 'rm -rf "$tmp_dir"' EXIT

psql_args=("$database_url" -X -v ON_ERROR_STOP=1 -v "schema=$schema" -qAt)

psql "${psql_args[@]}" <<'SQL'
create schema :"schema";
create table :"schema".campaigns (
  id integer primary key,
  status text not null,
  pause_requested boolean not null default false
);
create table :"schema".messages (
  id integer primary key,
  campaign_id integer not null references :"schema".campaigns(id),
  status text not null,
  claimed_at timestamptz
);
insert into :"schema".campaigns values (1, 'QUEUED', false);
insert into :"schema".messages values (1, 1, 'QUEUED', null);

create or replace function :"schema".claim_one(p_pause numeric default 0)
returns integer language plpgsql as $fn$
declare v_campaign_id integer; v_message_id integer;
begin
  select c.id into v_campaign_id
  from :"schema".campaigns c
  where c.status in ('QUEUED','RUNNING') and not c.pause_requested
    and exists (select 1 from :"schema".messages m where m.campaign_id = c.id and m.status = 'QUEUED')
  order by c.id for update skip locked limit 1;
  if v_campaign_id is null then return null; end if;
  perform pg_sleep(p_pause);
  select m.id into v_message_id from :"schema".messages m
  where m.campaign_id = v_campaign_id and m.status = 'QUEUED'
  order by m.id for update skip locked limit 1;
  if v_message_id is null then return null; end if;
  update :"schema".messages set status = 'SENDING', claimed_at = clock_timestamp() where id = v_message_id;
  update :"schema".campaigns set status = 'RUNNING' where id = v_campaign_id and status in ('QUEUED','RUNNING') and not pause_requested;
  return v_message_id;
end;
$fn$;

create or replace function :"schema".cancel_one(p_pause numeric default 0)
returns void language plpgsql as $fn$
begin
  update :"schema".campaigns set status = 'CANCELLED', pause_requested = false where id = 1 and status in ('QUEUED','RUNNING','PAUSED');
  perform pg_sleep(p_pause);
  update :"schema".messages set status = 'CANCELLED' where campaign_id = 1 and status = 'QUEUED';
end;
$fn$;

create or replace function :"schema".pause_one()
returns void language plpgsql as $fn$
declare v_active integer;
begin
  perform 1 from :"schema".campaigns where id = 1 for update;
  select count(*) into v_active from :"schema".messages where campaign_id = 1 and status = 'SENDING';
  update :"schema".campaigns set pause_requested = true, status = case when v_active = 0 then 'PAUSED' else status end where id = 1 and status in ('QUEUED','RUNNING','PAUSED');
end;
$fn$;

create or replace function :"schema".release_one()
returns text language plpgsql as $fn$
declare v_status text; v_message_status text;
begin
  select status into v_status from :"schema".campaigns where id = 1 for update;
  select status into v_message_status from :"schema".messages where id = 1 for update;
  if v_status = 'CANCELLED' then update :"schema".messages set status = 'CANCELLED' where id = 1 and status = 'SENDING'; return 'CANCELLED'; end if;
  update :"schema".messages set status = 'QUEUED', claimed_at = null where id = 1 and status = 'SENDING';
  return 'QUEUED';
end;
$fn$;
SQL

run_sql() { psql "${psql_args[@]}" -c "$1"; }
reset_fixture() { run_sql "update \"$schema\".campaigns set status='QUEUED', pause_requested=false; update \"$schema\".messages set status='QUEUED', claimed_at=null;" >/dev/null; }
assert_state() {
  local expected=$1
  local actual
  actual=$(run_sql "select c.status || ':' || c.pause_requested || ':' || m.status from \"$schema\".campaigns c join \"$schema\".messages m on m.campaign_id=c.id where c.id=1")
  [[ "$actual" == "$expected" ]] || { echo "expected $expected, got $actual" >&2; exit 1; }
}

reset_fixture
run_sql "select \"$schema\".cancel_one(0.5)" >/dev/null & cancel_pid=$!
sleep 0.1
run_sql "select \"$schema\".claim_one(0)" >/dev/null & claim_pid=$!
wait "$cancel_pid"; wait "$claim_pid"
assert_state 'CANCELLED:false:CANCELLED'

reset_fixture
run_sql "select \"$schema\".claim_one(0.5)" >/dev/null & claim_pid=$!
sleep 0.1
run_sql "select \"$schema\".cancel_one(0)" >/dev/null & cancel_pid=$!
wait "$claim_pid"; wait "$cancel_pid"
assert_state 'CANCELLED:false:SENDING'

reset_fixture
run_sql "select \"$schema\".pause_one()" >/dev/null
run_sql "select \"$schema\".claim_one(0)" >/dev/null
assert_state 'PAUSED:true:QUEUED'

run_sql "drop schema \"$schema\" cascade" >/dev/null
echo 'PASS: claim/cancel/pause two-session lock-order scenarios'
