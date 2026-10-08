-- Core Operations release hardening.
-- Forward-only. Do not edit or re-run migrations already applied remotely.

-- Cover every composite foreign key in its declared column order.
create index if not exists campaign_recipients_campaign_owner_idx
  on public.campaign_recipients (campaign_id, owner_id);
create index if not exists campaign_recipients_contact_owner_idx
  on public.campaign_recipients (contact_id, owner_id);
create index if not exists campaign_recipients_owner_idx
  on public.campaign_recipients (owner_id);
create index if not exists messages_campaign_owner_idx
  on public.messages (campaign_id, owner_id);
create index if not exists messages_contact_owner_idx
  on public.messages (contact_id, owner_id);
create index if not exists messages_recipient_owner_idx
  on public.messages (campaign_recipient_id, owner_id);

-- Browser users read these rows, but writes go through capability-gated RPCs.
revoke insert, update, delete on table public.messages from anon, authenticated;
revoke insert, update, delete on table public.campaign_recipients from anon, authenticated;
revoke all on table public.webhook_events from anon, authenticated;
revoke update, delete on table public.campaigns from anon, authenticated;
drop policy if exists "campaigns_insert_own" on public.campaigns;
create policy "campaigns_insert_own" on public.campaigns
  for insert to authenticated
  with check ((select auth.uid()) = owner_id and status = 'DRAFT');

-- A campaign snapshot is immutable once created. It creates READY work only;
-- queue_campaign is the explicit user confirmation boundary.
create or replace function public.create_campaign_snapshot(p_campaign_id uuid, p_contact_ids uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_owner_id uuid := (select auth.uid());
  v_count integer := 0;
  v_status text;
begin
  if v_owner_id is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000'; end if;
  select status into v_status
  from public.campaigns
  where id = p_campaign_id and owner_id = v_owner_id
  for update;
  if v_status is distinct from 'DRAFT' then
    raise exception 'CAMPAIGN_SNAPSHOT_CLOSED' using errcode = '55000';
  end if;

  with inserted as (
    insert into public.campaign_recipients
      (campaign_id, owner_id, contact_id, gender_snapshot, phone_snapshot, resolved_message_variant)
    select p_campaign_id, v_owner_id, c.id, coalesce(c.gender, 'UNKNOWN'), c.phone_e164,
      case
        when coalesce(c.gender, 'UNKNOWN') = 'MALE' and nullif(cp.male_message, '') is not null then 'MALE'
        when coalesce(c.gender, 'UNKNOWN') = 'FEMALE' and nullif(cp.female_message, '') is not null then 'FEMALE'
        else 'NEUTRAL'
      end
    from public.contacts c
    join public.campaigns cp on cp.id = p_campaign_id and cp.owner_id = v_owner_id
    where c.owner_id = v_owner_id and c.id = any(p_contact_ids) and c.archived_at is null
    on conflict (campaign_id, contact_id) do nothing
    returning id, campaign_id, owner_id, contact_id, phone_snapshot, resolved_message_variant
  )
  insert into public.messages
    (owner_id, campaign_id, campaign_recipient_id, contact_id, destination, message_text, media_path)
  select i.owner_id, i.campaign_id, i.id, i.contact_id, i.phone_snapshot,
    case i.resolved_message_variant
      when 'MALE' then cp.male_message
      when 'FEMALE' then cp.female_message
      else cp.neutral_message
    end,
    cp.media_path
  from inserted i
  join public.campaigns cp on cp.id = i.campaign_id and cp.owner_id = i.owner_id;
  get diagnostics v_count = row_count;

  update public.campaigns set status = 'READY'
  where id = p_campaign_id and owner_id = v_owner_id and status = 'DRAFT';
  return v_count;
end;
$$;

-- Explicit user confirmation boundary. Repeating a queue request is harmless.
create or replace function public.queue_campaign(p_campaign_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_owner_id uuid := (select auth.uid());
  v_updated integer;
begin
  if v_owner_id is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000'; end if;
  update public.campaigns set status = 'QUEUED'
  where id = p_campaign_id and owner_id = v_owner_id and status = 'READY';
  get diagnostics v_updated = row_count;
  if v_updated = 1 then return true; end if;
  return exists (select 1 from public.campaigns where id = p_campaign_id and owner_id = v_owner_id and status = 'QUEUED');
end;
$$;

create or replace function public.pause_campaign(p_campaign_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_owner_id uuid := (select auth.uid());
  v_updated integer;
begin
  if v_owner_id is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000'; end if;
  update public.campaigns set status = 'PAUSED'
  where id = p_campaign_id and owner_id = v_owner_id and status in ('QUEUED', 'RUNNING');
  get diagnostics v_updated = row_count;
  if v_updated = 1 then return true; end if;
  return exists (select 1 from public.campaigns where id = p_campaign_id and owner_id = v_owner_id and status = 'PAUSED');
end;
$$;

create or replace function public.resume_campaign(p_campaign_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_owner_id uuid := (select auth.uid());
  v_updated integer;
begin
  if v_owner_id is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000'; end if;
  update public.campaigns set status = 'QUEUED'
  where id = p_campaign_id and owner_id = v_owner_id and status = 'PAUSED';
  get diagnostics v_updated = row_count;
  if v_updated = 1 then return true; end if;
  return exists (select 1 from public.campaigns where id = p_campaign_id and owner_id = v_owner_id and status = 'QUEUED');
end;
$$;

-- Cancellation leaves SENDING messages in flight so their provider outcome remains traceable.
create or replace function public.cancel_campaign(p_campaign_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_owner_id uuid := (select auth.uid());
  v_updated integer;
begin
  if v_owner_id is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000'; end if;
  update public.campaigns set status = 'CANCELLED'
  where id = p_campaign_id and owner_id = v_owner_id and status in ('DRAFT','READY','QUEUED','RUNNING','PAUSED');
  get diagnostics v_updated = row_count;
  if v_updated = 0 then return false; end if;
  update public.messages set status = 'CANCELLED', updated_at = now()
  where owner_id = v_owner_id and campaign_id = p_campaign_id and status = 'QUEUED';
  update public.campaign_recipients cr set status = 'CANCELLED'
  where cr.owner_id = v_owner_id and cr.campaign_id = p_campaign_id and cr.status = 'QUEUED'
    and not exists (select 1 from public.messages m where m.campaign_recipient_id = cr.id and m.status = 'SENDING');
  return true;
end;
$$;

-- Claim only explicit campaign starts. The first claimed campaign batch enters RUNNING.
create or replace function public.claim_outbox_batch(p_limit integer default 20)
returns setof public.messages language plpgsql security definer set search_path = public as $$
begin
  return query
  with candidates as (
    select m.id
    from public.messages m
    where m.status = 'QUEUED'
      and m.available_at <= now()
      and (
        m.campaign_id is null
        or exists (
          select 1 from public.campaigns c
          where c.id = m.campaign_id and c.owner_id = m.owner_id
            and c.status in ('QUEUED', 'RUNNING')
        )
      )
    order by m.available_at, m.created_at, m.id
    for update skip locked
    limit greatest(1, least(p_limit, 100))
  ), claimed as (
    update public.messages m
    set status = 'SENDING', claimed_at = now(), attempt_count = m.attempt_count + 1, updated_at = now()
    from candidates c
    where m.id = c.id
    returning m.*
  ), started as (
    update public.campaigns c
    set status = 'RUNNING', started_at = coalesce(c.started_at, now())
    where c.status = 'QUEUED'
      and exists (select 1 from claimed m where m.campaign_id = c.id)
    returning c.id
  )
  select claimed.* from claimed;
end;
$$;

-- Reconcile campaign status after every terminal message transition.
create or replace function public.refresh_campaign_status(p_campaign_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_next text;
begin
  select status into v_status from public.campaigns where id = p_campaign_id for update;
  if v_status is null or v_status in ('CANCELLED', 'COMPLETED', 'FAILED') then return v_status; end if;
  if exists (select 1 from public.messages where campaign_id = p_campaign_id and status in ('QUEUED', 'SENDING')) then
    return v_status;
  end if;
  if exists (select 1 from public.messages where campaign_id = p_campaign_id and status in ('FAILED', 'OUTCOME_UNKNOWN')) then
    v_next := 'FAILED';
  else
    v_next := 'COMPLETED';
  end if;
  update public.campaigns set status = v_next, completed_at = now() where id = p_campaign_id;
  return v_next;
end;
$$;

revoke all on function public.create_campaign_snapshot(uuid, uuid[]) from public, anon;
grant execute on function public.create_campaign_snapshot(uuid, uuid[]) to authenticated, service_role;
revoke all on function public.queue_campaign(uuid) from public, anon;
grant execute on function public.queue_campaign(uuid) to authenticated;
revoke all on function public.pause_campaign(uuid) from public, anon;
grant execute on function public.pause_campaign(uuid) to authenticated;
revoke all on function public.resume_campaign(uuid) from public, anon;
grant execute on function public.resume_campaign(uuid) to authenticated;
revoke all on function public.cancel_campaign(uuid) from public, anon;
grant execute on function public.cancel_campaign(uuid) to authenticated;
revoke all on function public.claim_outbox_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_outbox_batch(integer) to service_role;
revoke all on function public.refresh_campaign_status(uuid) from public, anon, authenticated;
grant execute on function public.refresh_campaign_status(uuid) to service_role;
