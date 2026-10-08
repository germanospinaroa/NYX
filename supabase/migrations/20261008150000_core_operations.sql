-- NYX core operations: contact context, campaigns, immutable recipients and outbox.
-- Forward-only. Do not apply automatically; migration history still needs repair.

alter table public.contacts add column if not exists notes text;
alter table public.contacts add column if not exists archived_at timestamptz;
create index if not exists contacts_owner_archived_created_idx on public.contacts (owner_id, archived_at, created_at desc);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text,
  status text not null default 'DRAFT' check (status in ('DRAFT','READY','QUEUED','RUNNING','PAUSED','COMPLETED','CANCELLED','FAILED')),
  neutral_message text,
  male_message text,
  female_message text,
  media_path text,
  created_at timestamptz not null default now(),
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  constraint campaigns_id_owner_unique unique (id, owner_id)
);

create table if not exists public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null,
  gender_snapshot text not null check (gender_snapshot in ('MALE','FEMALE','UNKNOWN')),
  phone_snapshot text not null check (phone_snapshot ~ '^\\+[1-9][0-9]{7,14}$'),
  resolved_message_variant text not null check (resolved_message_variant in ('NEUTRAL','MALE','FEMALE')),
  status text not null default 'QUEUED' check (status in ('QUEUED','SENT','FAILED','OUTCOME_UNKNOWN','CANCELLED')),
  created_at timestamptz not null default now(),
  constraint campaign_recipients_campaign_owner_fk foreign key (campaign_id, owner_id) references public.campaigns(id, owner_id) on delete cascade,
  constraint campaign_recipients_contact_owner_fk foreign key (contact_id, owner_id) references public.contacts(id, owner_id) on delete restrict,
  constraint campaign_recipients_id_owner_unique unique (id, owner_id),
  constraint campaign_recipients_unique_contact unique (campaign_id, contact_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid,
  campaign_recipient_id uuid,
  contact_id uuid not null,
  channel text not null default 'WHATSAPP' check (channel in ('WHATSAPP')),
  destination text not null check (destination ~ '^\\+[1-9][0-9]{7,14}$'),
  message_text text not null default '',
  media_path text,
  status text not null default 'QUEUED' check (status in ('QUEUED','SENDING','SENT','FAILED','OUTCOME_UNKNOWN','CANCELLED')),
  provider_message_id text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint messages_campaign_owner_fk foreign key (campaign_id, owner_id) references public.campaigns(id, owner_id) on delete restrict,
  constraint messages_recipient_owner_fk foreign key (campaign_recipient_id, owner_id) references public.campaign_recipients(id, owner_id) on delete restrict,
  constraint messages_contact_owner_fk foreign key (contact_id, owner_id) references public.contacts(id, owner_id) on delete restrict
);

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'EVOLUTION',
  event_name text not null,
  fingerprint text not null,
  provider_message_id text,
  remote_jid text,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  constraint webhook_events_fingerprint_unique unique (provider, fingerprint)
);

create index if not exists campaigns_owner_created_idx on public.campaigns (owner_id, created_at desc);
create index if not exists campaign_recipients_campaign_status_idx on public.campaign_recipients (campaign_id, status);
create index if not exists messages_queue_idx on public.messages (status, available_at, created_at);
create index if not exists messages_owner_created_idx on public.messages (owner_id, created_at desc);

alter table public.campaigns enable row level security;
alter table public.campaign_recipients enable row level security;
alter table public.messages enable row level security;
alter table public.webhook_events enable row level security;

create policy "campaigns_select_own" on public.campaigns for select to authenticated using ((select auth.uid()) = owner_id);
create policy "campaigns_insert_own" on public.campaigns for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "campaigns_update_own" on public.campaigns for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "campaigns_delete_own" on public.campaigns for delete to authenticated using ((select auth.uid()) = owner_id);
create policy "campaign_recipients_select_own" on public.campaign_recipients for select to authenticated using ((select auth.uid()) = owner_id);
create policy "messages_select_own" on public.messages for select to authenticated using ((select auth.uid()) = owner_id);

create or replace function public.create_campaign_snapshot(p_campaign_id uuid, p_contact_ids uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare v_owner_id uuid := (select auth.uid()); v_count integer := 0; v_status text;
begin
  if v_owner_id is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000'; end if;
  select status into v_status from public.campaigns where id = p_campaign_id and owner_id = v_owner_id for update;
  if v_status is distinct from 'DRAFT' then raise exception 'CAMPAIGN_SNAPSHOT_CLOSED' using errcode = '55000'; end if;
  with inserted as (
    insert into public.campaign_recipients (campaign_id, owner_id, contact_id, gender_snapshot, phone_snapshot, resolved_message_variant)
    select p_campaign_id, v_owner_id, c.id, coalesce(c.gender, 'UNKNOWN'), c.phone_e164,
      case when coalesce(c.gender, 'UNKNOWN') = 'MALE' and nullif(cp.male_message, '') is not null then 'MALE'
           when coalesce(c.gender, 'UNKNOWN') = 'FEMALE' and nullif(cp.female_message, '') is not null then 'FEMALE'
           else 'NEUTRAL' end
    from public.contacts c join public.campaigns cp on cp.id = p_campaign_id and cp.owner_id = v_owner_id
    where c.owner_id = v_owner_id and c.id = any(p_contact_ids) and c.archived_at is null
    on conflict (campaign_id, contact_id) do nothing
    returning id, campaign_id, owner_id, contact_id, gender_snapshot, phone_snapshot, resolved_message_variant
  )
  insert into public.messages (owner_id, campaign_id, campaign_recipient_id, contact_id, destination, message_text, media_path)
  select i.owner_id, i.campaign_id, i.id, i.contact_id, i.phone_snapshot,
    case i.resolved_message_variant when 'MALE' then cp.male_message when 'FEMALE' then cp.female_message else cp.neutral_message end,
    cp.media_path
  from inserted i join public.campaigns cp on cp.id = i.campaign_id and cp.owner_id = i.owner_id;
  get diagnostics v_count = row_count;
  update public.campaigns set status = 'READY' where id = p_campaign_id and owner_id = v_owner_id and status = 'DRAFT';
  return v_count;
end; $$;

/* Previous shape retained conceptually: recipients and outbox rows are created
   in one set-based operation, so the browser never sends message rows. */
/*
  insert into public.campaign_recipients ...
  select p_campaign_id, v_owner_id, c.id, coalesce(c.gender, 'UNKNOWN'), c.phone_e164, 'NEUTRAL'
  from public.contacts c join public.campaigns cp on cp.id = p_campaign_id and cp.owner_id = v_owner_id
  where c.owner_id = v_owner_id and c.id = any(p_contact_ids) and c.archived_at is null
  on conflict (campaign_id, contact_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
*/

create or replace function public.enqueue_single_message(p_contact_id uuid, p_message_text text, p_media_path text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_owner_id uuid := (select auth.uid());
  v_message_id uuid;
begin
  if v_owner_id is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000'; end if;
  if p_message_text is null or btrim(p_message_text) = '' then raise exception 'INVALID_MESSAGE' using errcode = '22023'; end if;
  if p_media_path is not null and left(p_media_path, 8) <> 'https://' then raise exception 'INVALID_MEDIA' using errcode = '22023'; end if;
  if not exists (select 1 from public.contacts where id = p_contact_id and owner_id = v_owner_id and archived_at is null) then
    raise exception 'CONTACT_NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into public.messages (owner_id, contact_id, destination, message_text, media_path)
  select v_owner_id, c.id, c.phone_e164, trim(p_message_text), p_media_path
  from public.contacts c
  where c.id = p_contact_id and c.owner_id = v_owner_id and c.archived_at is null
  returning id into v_message_id;
  return v_message_id;
end; $$;

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
  update public.campaign_recipients set status = 'CANCELLED'
  where owner_id = v_owner_id and campaign_id = p_campaign_id and status = 'QUEUED'
    and not exists (select 1 from public.messages m where m.campaign_recipient_id = public.campaign_recipients.id and m.status = 'SENDING');
  return true;
end; $$;

create or replace function public.claim_outbox_batch(p_limit integer default 20)
returns setof public.messages language sql security definer set search_path = public as $$
  with candidates as (
    select m.id from public.messages m
    where m.status = 'QUEUED' and m.available_at <= now()
      and (m.campaign_id is null or exists (select 1 from public.campaigns c where c.id = m.campaign_id and c.owner_id = m.owner_id and c.status not in ('CANCELLED','PAUSED')))
    order by available_at, created_at, id for update skip locked limit greatest(1, least(p_limit, 100))
  )
  update public.messages m set status = 'SENDING', claimed_at = now(), attempt_count = m.attempt_count + 1, updated_at = now()
  from candidates c where m.id = c.id returning m.*;
$$;

revoke all on function public.create_campaign_snapshot(uuid, uuid[]) from public;
revoke all on function public.create_campaign_snapshot(uuid, uuid[]) from anon;
grant execute on function public.create_campaign_snapshot(uuid, uuid[]) to authenticated;
grant execute on function public.create_campaign_snapshot(uuid, uuid[]) to service_role;
revoke all on function public.enqueue_single_message(uuid, text, text) from public;
revoke all on function public.enqueue_single_message(uuid, text, text) from anon;
grant execute on function public.enqueue_single_message(uuid, text, text) to authenticated;
revoke all on function public.cancel_campaign(uuid) from public;
revoke all on function public.cancel_campaign(uuid) from anon;
grant execute on function public.cancel_campaign(uuid) to authenticated;
revoke all on function public.claim_outbox_batch(integer) from public;
revoke all on function public.claim_outbox_batch(integer) from anon;
revoke all on function public.claim_outbox_batch(integer) from authenticated;
grant execute on function public.claim_outbox_batch(integer) to service_role;
