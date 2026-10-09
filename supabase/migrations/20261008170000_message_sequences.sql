-- Message sequences for individual and future campaign sends.
-- Forward-only. Do not edit or re-run migrations already applied remotely.

create table if not exists public.message_sequences (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null,
  campaign_id uuid,
  status text not null default 'QUEUED' check (status in ('QUEUED','SENDING','SENT','FAILED','OUTCOME_UNKNOWN','CANCELLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  last_error_code text,
  last_error_message text,
  constraint message_sequences_id_owner_unique unique (id, owner_id),
  constraint message_sequences_contact_owner_fk foreign key (contact_id, owner_id) references public.contacts(id, owner_id) on delete restrict,
  constraint message_sequences_campaign_owner_fk foreign key (campaign_id, owner_id) references public.campaigns(id, owner_id) on delete cascade
);

alter table public.messages add column if not exists sequence_id uuid;
alter table public.messages add column if not exists sequence_index integer;
alter table public.messages add column if not exists message_type text not null default 'TEXT';
alter table public.messages add column if not exists caption text;
alter table public.messages add constraint messages_message_type_check check (message_type in ('TEXT','IMAGE'));
alter table public.messages add constraint messages_sequence_index_check check (sequence_id is null or sequence_index is not null and sequence_index >= 0);
alter table public.messages add constraint messages_sequence_owner_fk foreign key (sequence_id, owner_id) references public.message_sequences(id, owner_id) on delete cascade;
alter table public.messages add constraint messages_sequence_index_unique unique (sequence_id, sequence_index);
create index if not exists message_sequences_owner_created_idx on public.message_sequences (owner_id, created_at desc);
create index if not exists message_sequences_contact_created_idx on public.message_sequences (contact_id, created_at desc);
create index if not exists message_sequences_status_idx on public.message_sequences (status, updated_at);
create index if not exists messages_sequence_claim_idx on public.messages (sequence_id, sequence_index, status, available_at);

alter table public.message_sequences enable row level security;
create policy "message_sequences_select_own" on public.message_sequences
  for select to authenticated using ((select auth.uid()) = owner_id);
revoke insert, update, delete on table public.message_sequences from anon, authenticated;

-- Private media is uploaded through the authenticated server route and read by the worker
-- only when a message is about to be sent. The stored value is a stable path, never a
-- temporary signed URL.
insert into storage.buckets (id, name, public)
values ('nyx-media', 'nyx-media', false)
on conflict (id) do update set public = false;
create policy "nyx_media_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'nyx-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "nyx_media_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'nyx-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "nyx_media_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'nyx-media' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'nyx-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "nyx_media_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'nyx-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Capability-gated because browser users cannot write messages directly. It validates
-- auth, owner scope, step shape and media references before one transactional insert.
create or replace function public.enqueue_message_sequence(
  p_contact_id uuid,
  p_steps jsonb,
  p_campaign_id uuid default null
)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_owner_id uuid := (select auth.uid());
  v_sequence_id uuid;
  v_step jsonb;
  v_index integer := 0;
begin
  if v_owner_id is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000'; end if;
  if jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps) < 1 or jsonb_array_length(p_steps) > 50 then
    raise exception 'INVALID_SEQUENCE' using errcode = '22023';
  end if;
  if not exists (select 1 from public.contacts where id = p_contact_id and owner_id = v_owner_id and archived_at is null) then
    raise exception 'CONTACT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_campaign_id is not null and not exists (select 1 from public.campaigns where id = p_campaign_id and owner_id = v_owner_id and status in ('DRAFT','READY')) then
    raise exception 'CAMPAIGN_NOT_READY' using errcode = '55000';
  end if;
  for v_step in select value from jsonb_array_elements(p_steps)
  loop
    if v_step->>'type' not in ('TEXT', 'IMAGE') then raise exception 'INVALID_SEQUENCE_STEP' using errcode = '22023'; end if;
    if v_step->>'type' = 'TEXT' and nullif(btrim(coalesce(v_step->>'text', '')), '') is null then raise exception 'INVALID_TEXT_STEP' using errcode = '22023'; end if;
    if v_step->>'type' = 'IMAGE' and nullif(btrim(coalesce(v_step->>'mediaPath', '')), '') is null then raise exception 'INVALID_IMAGE_STEP' using errcode = '22023'; end if;
    if v_step->>'type' = 'IMAGE' and left(btrim(v_step->>'mediaPath'), length(v_owner_id::text) + 1) <> (v_owner_id::text || '/') then
      raise exception 'INVALID_MEDIA_OWNER' using errcode = '22023';
    end if;
    v_index := v_index + 1;
  end loop;
  insert into public.message_sequences (owner_id, contact_id, campaign_id)
  values (v_owner_id, p_contact_id, p_campaign_id)
  returning id into v_sequence_id;
  insert into public.messages (owner_id, campaign_id, contact_id, sequence_id, sequence_index, destination, message_text, message_type, caption, media_path)
  select v_owner_id, p_campaign_id, p_contact_id, v_sequence_id, (item.ordinality - 1)::integer,
    c.phone_e164,
    case when item.value->>'type' = 'TEXT' then btrim(item.value->>'text') else '' end,
    item.value->>'type', nullif(item.value->>'caption', ''), nullif(item.value->>'mediaPath', '')
  from public.contacts c, jsonb_array_elements(p_steps) with ordinality item
  where c.id = p_contact_id and c.owner_id = v_owner_id;
  return v_sequence_id;
end;
$$;

-- Compatibility entry point: a single message is now a one-step sequence.
create or replace function public.enqueue_single_message(p_contact_id uuid, p_message_text text, p_media_path text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return public.enqueue_message_sequence(p_contact_id, jsonb_build_array(jsonb_build_object(
    'type', case when p_media_path is null then 'TEXT' else 'IMAGE' end,
    'text', coalesce(p_message_text, ''),
    'mediaPath', p_media_path
  )));
end;
$$;

-- Only the first step, or the immediate successor of a SENT step, is claimable.
create or replace function public.claim_outbox_batch(p_limit integer default 20)
returns setof public.messages language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return query
  with candidates as (
    select m.id
    from public.messages m
    where m.status = 'QUEUED' and m.available_at <= now()
      and (m.campaign_id is null or exists (select 1 from public.campaigns c where c.id = m.campaign_id and c.owner_id = m.owner_id and c.status in ('QUEUED','RUNNING')))
      and (m.sequence_id is null or m.sequence_index = 0 or exists (
        select 1 from public.messages previous
        where previous.sequence_id = m.sequence_id and previous.sequence_index = m.sequence_index - 1 and previous.status = 'SENT'
      ))
    order by m.available_at, m.created_at, m.id
    for update skip locked limit greatest(1, least(p_limit, 100))
  ), claimed as (
    update public.messages m set status = 'SENDING', claimed_at = now(), attempt_count = m.attempt_count + 1, updated_at = now()
    from candidates c where m.id = c.id returning m.*
  ), started as (
    update public.message_sequences s set status = 'SENDING', started_at = coalesce(s.started_at, now()), updated_at = now()
    from claimed c where s.id = c.sequence_id and s.status = 'QUEUED'
  )
  select * from claimed;
end;
$$;

create or replace function public.refresh_message_sequence_status(p_sequence_id uuid)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_next text; v_current text;
begin
  select status into v_current from public.message_sequences where id = p_sequence_id for update;
  if v_current is null or v_current in ('FAILED','OUTCOME_UNKNOWN','CANCELLED','SENT') then return v_current; end if;
  if exists (select 1 from public.messages where sequence_id = p_sequence_id and status in ('QUEUED','SENDING')) then
    update public.message_sequences set status = 'SENDING', updated_at = now() where id = p_sequence_id;
    return 'SENDING';
  end if;
  if exists (select 1 from public.messages where sequence_id = p_sequence_id and status = 'OUTCOME_UNKNOWN') then v_next := 'OUTCOME_UNKNOWN';
  elsif exists (select 1 from public.messages where sequence_id = p_sequence_id and status = 'FAILED') then v_next := 'FAILED';
  elsif exists (select 1 from public.messages where sequence_id = p_sequence_id and status = 'CANCELLED') then v_next := 'CANCELLED';
  else v_next := 'SENT'; end if;
  update public.messages set status = 'CANCELLED', updated_at = now() where sequence_id = p_sequence_id and status = 'QUEUED' and v_next <> 'SENT';
  update public.message_sequences set status = v_next, completed_at = now(), updated_at = now() where id = p_sequence_id;
  return v_next;
end;
$$;

revoke all on function public.enqueue_message_sequence(uuid, jsonb, uuid) from public, anon;
grant execute on function public.enqueue_message_sequence(uuid, jsonb, uuid) to authenticated;
revoke all on function public.enqueue_single_message(uuid, text, text) from public, anon;
grant execute on function public.enqueue_single_message(uuid, text, text) to authenticated;
revoke all on function public.claim_outbox_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_outbox_batch(integer) to service_role;
revoke all on function public.refresh_message_sequence_status(uuid) from public, anon, authenticated;
grant execute on function public.refresh_message_sequence_status(uuid) to service_role;
