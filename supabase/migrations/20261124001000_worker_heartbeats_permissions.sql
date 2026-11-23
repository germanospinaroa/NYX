-- Keep worker heartbeat writes exclusive to the server-side worker.
-- The project has broad default table grants for authenticated; narrow this
-- table explicitly so RLS and ACLs express the same least-privilege contract.
revoke all on table public.worker_heartbeats from authenticated;
grant select on table public.worker_heartbeats to authenticated;

revoke all on table public.worker_heartbeats from anon, public;
grant select, insert, update on table public.worker_heartbeats to service_role;
