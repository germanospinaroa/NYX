-- NYX worker liveness telemetry. Forward-only; apply after the web/worker
-- release is reviewed. A missing or stale row is never treated as RUNNING.
create table if not exists public.worker_heartbeats (
  worker_id text primary key,
  status text not null check (status in ('RUNNING', 'ERROR')),
  last_seen_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.worker_heartbeats enable row level security;
revoke all on table public.worker_heartbeats from public, anon;
grant select on table public.worker_heartbeats to authenticated;
grant select, insert, update on table public.worker_heartbeats to service_role;

drop policy if exists worker_heartbeats_authenticated_read on public.worker_heartbeats;
create policy worker_heartbeats_authenticated_read
  on public.worker_heartbeats
  for select
  to authenticated
  using (true);
