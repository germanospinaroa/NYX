-- Administrative, single-message dispatch claim. This never scans or changes
-- another queued message and is intentionally unavailable to browser roles.
create or replace function public.claim_direct_message(p_message_id uuid)
returns setof public.messages
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_message public.messages%rowtype;
begin
  select m.*
    into v_message
    from public.messages m
    join public.message_sequences s on s.id = m.sequence_id
      and s.owner_id = m.owner_id
      and s.campaign_id is null
      and s.campaign_recipient_id is null
  where m.id = p_message_id
    and m.status = 'QUEUED'
    and m.provider_message_id is null
    and m.campaign_id is null
    and m.campaign_recipient_id is null
    and m.available_at <= now()
  for update of m;

  if not found then return; end if;

  update public.messages
     set status = 'SENDING',
         claimed_at = now(),
         attempt_count = attempt_count + 1,
         updated_at = now()
   where id = v_message.id
     and status = 'QUEUED'
     and provider_message_id is null
  returning * into v_message;

  if found then return next v_message; end if;
  return;
end;
$$;

revoke all on function public.claim_direct_message(uuid) from public, anon, authenticated;
grant execute on function public.claim_direct_message(uuid) to service_role;
