-- NYX Campaign Intelligence V2. Forward-only; do not apply automatically.
-- Adds personalization snapshots, channel permission, frequency protection and scheduling.

alter table public.campaigns
  drop constraint if exists campaigns_status_check;
alter table public.campaigns
  add constraint campaigns_status_check
  check (status in ('DRAFT','READY','SCHEDULED','QUEUED','RUNNING','PAUSED','COMPLETED','CANCELLED','FAILED'));
alter table public.campaigns
  add column if not exists frequency_cap_days integer not null default 7;
alter table public.campaigns
  add constraint campaigns_frequency_cap_days_check check (frequency_cap_days between 1 and 90);

alter table public.campaign_recipients
  add column if not exists first_name_snapshot text,
  add column if not exists display_name_snapshot text,
  add column if not exists permission_status_snapshot text,
  add column if not exists frequency_limited boolean not null default false;
alter table public.campaign_recipients
  add constraint campaign_recipients_permission_snapshot_check
  check (permission_status_snapshot in ('OPTED_IN'));

create table if not exists public.contact_channel_permissions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null,
  channel text not null check (channel in ('WHATSAPP')),
  status text not null default 'UNKNOWN' check (status in ('UNKNOWN','OPTED_IN','OPTED_OUT')),
  consent_at timestamptz,
  consent_source text,
  opted_out_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contact_channel_permissions_contact_owner_fk
    foreign key (contact_id, owner_id) references public.contacts(id, owner_id) on delete cascade,
  constraint contact_channel_permissions_unique unique (owner_id, contact_id, channel),
  constraint contact_channel_permissions_consent_shape_check check (
    (status = 'OPTED_IN' and consent_at is not null and nullif(btrim(coalesce(consent_source, '')), '') is not null and opted_out_at is null)
    or (status = 'OPTED_OUT' and opted_out_at is not null)
    or (status = 'UNKNOWN' and consent_at is null and opted_out_at is null)
  )
);

create index if not exists messages_campaign_frequency_idx
  on public.messages (owner_id, contact_id, sent_at)
  where campaign_id is not null and status = 'SENT';
create index if not exists campaign_recipients_campaign_owner_idx
  on public.campaign_recipients (campaign_id, owner_id);

alter table public.contact_channel_permissions enable row level security;
drop policy if exists "contact_channel_permissions_select_own" on public.contact_channel_permissions;
drop policy if exists "contact_channel_permissions_insert_own" on public.contact_channel_permissions;
drop policy if exists "contact_channel_permissions_update_own" on public.contact_channel_permissions;
create policy "contact_channel_permissions_select_own" on public.contact_channel_permissions
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy "contact_channel_permissions_insert_own" on public.contact_channel_permissions
  for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "contact_channel_permissions_update_own" on public.contact_channel_permissions
  for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
revoke all on table public.contact_channel_permissions from anon;
grant select, insert, update on table public.contact_channel_permissions to authenticated;

-- Set-based permission semantics used by Contacts and campaign audience resolution.
create or replace function public.resolve_contact_ids_for_selection(
  p_q text default '', p_gender text default null, p_label_id uuid default null,
  p_archived text default 'ACTIVE', p_permission text default null, p_exclude_ids uuid[] default '{}'
)
returns setof uuid language sql stable security invoker set search_path = public, pg_temp as $$
  select c.id
  from public.contacts c
  where c.owner_id = (select auth.uid())
    and (nullif(p_q, '') is null or c.display_name ilike '%' || p_q || '%' or c.phone_e164 ilike '%' || p_q || '%')
    and (p_gender is null or p_gender = '' or c.gender = p_gender)
    and (p_archived = 'ALL' or (p_archived = 'ARCHIVED' and c.archived_at is not null) or (coalesce(p_archived, 'ACTIVE') = 'ACTIVE' and c.archived_at is null))
    and (p_label_id is null or exists (select 1 from public.contact_labels cl where cl.owner_id = c.owner_id and cl.contact_id = c.id and cl.label_id = p_label_id))
    and (p_permission is null or p_permission = ''
      or (p_permission in ('OPTED_IN','OPTED_OUT') and exists (select 1 from public.contact_channel_permissions cp where cp.owner_id = c.owner_id and cp.contact_id = c.id and cp.channel = 'WHATSAPP' and cp.status = p_permission))
      or (p_permission = 'UNKNOWN' and not exists (select 1 from public.contact_channel_permissions cp where cp.owner_id = c.owner_id and cp.contact_id = c.id and cp.channel = 'WHATSAPP' and cp.status in ('OPTED_IN','OPTED_OUT'))))
    and not (c.id = any(coalesce(p_exclude_ids, '{}')))
  order by c.created_at desc, c.id;
$$;

create or replace function public.get_contacts_workspace(
  p_q text default '', p_gender text default null, p_label_id uuid default null,
  p_archived text default 'ACTIVE', p_permission text default null, p_page integer default 0, p_page_size integer default 50
)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  with filtered as (
    select c.*,
      (select coalesce(jsonb_agg(jsonb_build_object('label_id', cl.label_id, 'labels', jsonb_build_object('id', l.id, 'name', l.name, 'color', l.color))), '[]'::jsonb)
       from public.contact_labels cl join public.labels l on l.id = cl.label_id and l.owner_id = c.owner_id
       where cl.owner_id = c.owner_id and cl.contact_id = c.id) as contact_labels
    from public.contacts c
    where c.id in (select public.resolve_contact_ids_for_selection(p_q, p_gender, p_label_id, p_archived, p_permission))
  ), page_rows as (
    select id, display_name, first_name, phone_e164, gender, gender_reviewed, created_at, contact_labels
    from filtered order by created_at desc, id offset greatest(p_page, 0) * least(greatest(p_page_size, 1), 100) limit least(greatest(p_page_size, 1), 100)
  )
  select jsonb_build_object('contacts', coalesce((select jsonb_agg(to_jsonb(page_rows)) from page_rows), '[]'::jsonb), 'total', (select count(*) from filtered));
$$;

create or replace function public.preflight_campaign_audience(p_contact_ids uuid[], p_frequency_cap_days integer)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare v_result jsonb;
begin
  if (select auth.uid()) is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000'; end if;
  if p_frequency_cap_days is null or p_frequency_cap_days not between 1 and 90 then raise exception 'INVALID_FREQUENCY_CAP' using errcode = '22023'; end if;
  with selected as (
    select distinct c.id, c.first_name, c.display_name, c.gender,
      coalesce(cp.status, 'UNKNOWN') as permission_status,
      exists (select 1 from public.messages m where m.owner_id = c.owner_id and m.contact_id = c.id and m.campaign_id is not null and m.status = 'SENT' and m.sent_at >= now() - make_interval(days => p_frequency_cap_days)) as recently_contacted
    from public.contacts c
    left join public.contact_channel_permissions cp on cp.owner_id = c.owner_id and cp.contact_id = c.id and cp.channel = 'WHATSAPP'
    where c.owner_id = (select auth.uid()) and c.id = any(p_contact_ids) and c.archived_at is null
  ), eligible as (
    select * from selected where permission_status = 'OPTED_IN' and not recently_contacted
  )
  select jsonb_build_object(
    'selected', (select count(*) from selected),
    'permitted', (select count(*) from selected where permission_status = 'OPTED_IN'),
    'unknown', (select count(*) from selected where permission_status = 'UNKNOWN'),
    'opted_out', (select count(*) from selected where permission_status = 'OPTED_OUT'),
    'recent', (select count(*) from selected where permission_status = 'OPTED_IN' and recently_contacted),
    'eligible', (select count(*) from eligible),
    'samples', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'first_name', first_name, 'display_name', display_name, 'gender', gender)) from (select * from eligible order by display_name, id limit 5) sample), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.resolve_campaign_template(
  p_template text,
  p_first_name text,
  p_display_name text
)
returns text language plpgsql immutable security invoker set search_path = public, pg_temp as $$
declare
  v_template text := coalesce(p_template, '');
  v_first_name text := nullif(btrim(coalesce(p_first_name, '')), '');
  v_display_name text := nullif(btrim(coalesce(p_display_name, '')), '');
begin
  if v_template ~ '\{\{'
    and regexp_replace(v_template, '\{\{\s*(nombre|nombre_completo)\s*\}\}', '', 'g') ~ '\{\{[^}]+\}\}' then
    raise exception 'VARIABLE_NO_COMPATIBLE' using errcode = '22023';
  end if;
  if v_template ~ '\{\{\s*nombre\s*\}\}' and v_first_name is null then
    raise exception 'MISSING_RECIPIENT_NAME' using errcode = '22023';
  end if;
  return regexp_replace(regexp_replace(v_template, '\{\{\s*nombre\s*\}\}', coalesce(v_first_name, ''), 'g'), '\{\{\s*nombre_completo\s*\}\}', coalesce(v_display_name, ''), 'g');
end;
$$;

create or replace function public.create_campaign_with_snapshot(
  p_name text,
  p_steps jsonb,
  p_contact_ids uuid[],
  p_frequency_cap_days integer default 7
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_owner_id uuid := (select auth.uid());
  v_campaign_id uuid;
  v_recipient_count integer := 0;
  v_step jsonb;
begin
  if v_owner_id is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000'; end if;
  if p_contact_ids is null or cardinality(p_contact_ids) < 1 or cardinality(p_contact_ids) > 100000 then raise exception 'EMPTY_AUDIENCE' using errcode = '22023'; end if;
  if p_frequency_cap_days is null or p_frequency_cap_days not between 1 and 90 then raise exception 'INVALID_FREQUENCY_CAP' using errcode = '22023'; end if;
  if jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps) < 1 or jsonb_array_length(p_steps) > 50 then raise exception 'INVALID_CAMPAIGN_STEPS' using errcode = '22023'; end if;

  for v_step in select value from jsonb_array_elements(p_steps) loop
    if v_step->>'type' not in ('TEXT','IMAGE','AUDIO') then raise exception 'INVALID_CAMPAIGN_STEP' using errcode = '22023'; end if;
    if v_step->>'type' = 'TEXT' then
      if nullif(btrim(v_step->>'neutralText'), '') is null or length(v_step->>'neutralText') > 10000 or length(coalesce(v_step->>'maleText', '')) > 10000 or length(coalesce(v_step->>'femaleText', '')) > 10000 then raise exception 'INVALID_CAMPAIGN_TEXT' using errcode = '22023'; end if;
      perform public.resolve_campaign_template(v_step->>'neutralText', 'placeholder', 'placeholder');
      if v_step ? 'maleText' and nullif(v_step->>'maleText', '') is not null then perform public.resolve_campaign_template(v_step->>'maleText', 'placeholder', 'placeholder'); end if;
      if v_step ? 'femaleText' and nullif(v_step->>'femaleText', '') is not null then perform public.resolve_campaign_template(v_step->>'femaleText', 'placeholder', 'placeholder'); end if;
    elsif v_step->>'type' = 'IMAGE' then
      if nullif(btrim(v_step->>'mediaPath'), '') is null or length(v_step->>'mediaPath') > 500 or left(btrim(v_step->>'mediaPath'), length(v_owner_id::text) + 1) <> (v_owner_id::text || '/') then raise exception 'INVALID_CAMPAIGN_MEDIA' using errcode = '22023'; end if;
    else
      if nullif(btrim(v_step->>'mediaPath'), '') is null or length(v_step->>'mediaPath') > 500 or left(btrim(v_step->>'mediaPath'), length(v_owner_id::text) + 1) <> (v_owner_id::text || '/') then raise exception 'INVALID_CAMPAIGN_MEDIA' using errcode = '22023'; end if;
      if v_step::text ~ '\{\{' then raise exception 'VARIABLE_NO_COMPATIBLE' using errcode = '22023'; end if;
    end if;
    if length(coalesce(v_step->>'neutralCaption', '')) > 10000 or length(coalesce(v_step->>'maleCaption', '')) > 10000 or length(coalesce(v_step->>'femaleCaption', '')) > 10000 then raise exception 'INVALID_CAMPAIGN_CAPTION' using errcode = '22023'; end if;
    if nullif(v_step->>'neutralCaption', '') is not null then perform public.resolve_campaign_template(v_step->>'neutralCaption', 'placeholder', 'placeholder'); end if;
    if nullif(v_step->>'maleCaption', '') is not null then perform public.resolve_campaign_template(v_step->>'maleCaption', 'placeholder', 'placeholder'); end if;
    if nullif(v_step->>'femaleCaption', '') is not null then perform public.resolve_campaign_template(v_step->>'femaleCaption', 'placeholder', 'placeholder'); end if;
  end loop;

  insert into public.campaigns (owner_id, name, status, frequency_cap_days)
  values (v_owner_id, nullif(btrim(coalesce(p_name, '')), ''), 'DRAFT', p_frequency_cap_days)
  returning id into v_campaign_id;

  insert into public.campaign_sequence_steps (
    campaign_id, owner_id, sequence_index, message_type, neutral_text, male_text, female_text,
    neutral_caption, male_caption, female_caption, media_path, media_mime_type, media_duration_ms
  )
  select v_campaign_id, v_owner_id, (item.ordinality - 1)::integer, item.value->>'type',
    nullif(item.value->>'neutralText', ''), nullif(item.value->>'maleText', ''), nullif(item.value->>'femaleText', ''),
    nullif(item.value->>'neutralCaption', ''), nullif(item.value->>'maleCaption', ''), nullif(item.value->>'femaleCaption', ''),
    nullif(btrim(item.value->>'mediaPath'), ''), nullif(item.value->>'mimeType', ''), nullif(item.value->>'durationMs', '')::integer
  from jsonb_array_elements(p_steps) with ordinality item;

  insert into public.campaign_recipients (
    campaign_id, owner_id, contact_id, gender_snapshot, phone_snapshot,
    first_name_snapshot, display_name_snapshot, permission_status_snapshot,
    frequency_limited, resolved_message_variant
  )
  select v_campaign_id, v_owner_id, c.id, coalesce(c.gender, 'UNKNOWN'), c.phone_e164,
    c.first_name, c.display_name, 'OPTED_IN', false,
    case when coalesce(c.gender, 'UNKNOWN') = 'MALE' and exists (select 1 from public.campaign_sequence_steps s where s.campaign_id = v_campaign_id and (nullif(s.male_text, '') is not null or nullif(s.male_caption, '') is not null)) then 'MALE'
         when coalesce(c.gender, 'UNKNOWN') = 'FEMALE' and exists (select 1 from public.campaign_sequence_steps s where s.campaign_id = v_campaign_id and (nullif(s.female_text, '') is not null or nullif(s.female_caption, '') is not null)) then 'FEMALE'
         else 'NEUTRAL' end
  from public.contacts c
  join public.contact_channel_permissions permission
    on permission.owner_id = v_owner_id and permission.contact_id = c.id and permission.channel = 'WHATSAPP' and permission.status = 'OPTED_IN'
  where c.owner_id = v_owner_id and c.id = any(p_contact_ids) and c.archived_at is null
    and not exists (
      select 1 from public.messages previous
      where previous.owner_id = v_owner_id and previous.contact_id = c.id and previous.campaign_id is not null
        and previous.status = 'SENT' and previous.sent_at >= now() - make_interval(days => p_frequency_cap_days)
    )
  on conflict (campaign_id, contact_id) do nothing;
  get diagnostics v_recipient_count = row_count;
  if v_recipient_count = 0 then raise exception 'NO_ELIGIBLE_RECIPIENTS' using errcode = '22023'; end if;

  insert into public.message_sequences (owner_id, contact_id, campaign_id, campaign_recipient_id)
  select cr.owner_id, cr.contact_id, cr.campaign_id, cr.id from public.campaign_recipients cr
  where cr.campaign_id = v_campaign_id and cr.owner_id = v_owner_id on conflict do nothing;

  insert into public.messages (
    owner_id, campaign_id, campaign_recipient_id, contact_id, sequence_id, sequence_index,
    destination, message_text, message_type, caption, media_path, media_mime_type, media_duration_ms
  )
  select ms.owner_id, ms.campaign_id, ms.campaign_recipient_id, ms.contact_id, ms.id, step.sequence_index,
    cr.phone_snapshot,
    case when step.message_type = 'TEXT' then public.resolve_campaign_template(
      case cr.resolved_message_variant when 'MALE' then coalesce(step.male_text, step.neutral_text) when 'FEMALE' then coalesce(step.female_text, step.neutral_text) else step.neutral_text end,
      coalesce(cr.first_name_snapshot, split_part(cr.display_name_snapshot, ' ', 1)), cr.display_name_snapshot
    ) else '' end,
    step.message_type,
    case when step.message_type = 'IMAGE' then public.resolve_campaign_template(
      case cr.resolved_message_variant when 'MALE' then coalesce(step.male_caption, step.neutral_caption) when 'FEMALE' then coalesce(step.female_caption, step.neutral_caption) else step.neutral_caption end,
      coalesce(cr.first_name_snapshot, split_part(cr.display_name_snapshot, ' ', 1)), cr.display_name_snapshot
    ) else null end,
    step.media_path, step.media_mime_type, step.media_duration_ms
  from public.message_sequences ms
  join public.campaign_recipients cr on cr.id = ms.campaign_recipient_id and cr.owner_id = ms.owner_id
  join public.campaign_sequence_steps step on step.campaign_id = ms.campaign_id and step.owner_id = ms.owner_id
  where ms.campaign_id = v_campaign_id and ms.owner_id = v_owner_id;

  update public.campaigns set status = 'READY' where id = v_campaign_id and owner_id = v_owner_id;
  return jsonb_build_object('campaign_id', v_campaign_id, 'recipients', v_recipient_count, 'steps', jsonb_array_length(p_steps), 'frequency_cap_days', p_frequency_cap_days, 'status', 'READY');
end;
$$;

create or replace function public.schedule_campaign(p_campaign_id uuid, p_scheduled_at timestamptz)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_owner_id uuid := (select auth.uid()); v_updated integer;
begin
  if v_owner_id is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000'; end if;
  if p_scheduled_at is null or p_scheduled_at <= now() or p_scheduled_at > now() + interval '1 year' then raise exception 'INVALID_SCHEDULE_TIME' using errcode = '22023'; end if;
  update public.campaigns set status = 'SCHEDULED', scheduled_at = p_scheduled_at
  where id = p_campaign_id and owner_id = v_owner_id and status in ('READY','SCHEDULED');
  get diagnostics v_updated = row_count;
  if v_updated = 0 then return false; end if;
  update public.messages set available_at = p_scheduled_at, updated_at = now()
  where campaign_id = p_campaign_id and owner_id = v_owner_id and status = 'QUEUED';
  return true;
end;
$$;

create or replace function public.queue_campaign(p_campaign_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_owner_id uuid := (select auth.uid()); v_updated integer;
begin
  if v_owner_id is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000'; end if;
  update public.campaigns set status = 'QUEUED', scheduled_at = null
  where id = p_campaign_id and owner_id = v_owner_id and status in ('READY','SCHEDULED');
  get diagnostics v_updated = row_count;
  if v_updated = 1 then
    update public.messages set available_at = now(), updated_at = now() where campaign_id = p_campaign_id and owner_id = v_owner_id and status = 'QUEUED';
    return true;
  end if;
  return exists (select 1 from public.campaigns where id = p_campaign_id and owner_id = v_owner_id and status = 'QUEUED');
end;
$$;

create or replace function public.cancel_campaign(p_campaign_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_owner_id uuid := (select auth.uid()); v_updated integer;
begin
  if v_owner_id is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000'; end if;
  update public.campaigns set status = 'CANCELLED' where id = p_campaign_id and owner_id = v_owner_id and status in ('DRAFT','READY','SCHEDULED','QUEUED','RUNNING','PAUSED');
  get diagnostics v_updated = row_count;
  if v_updated = 0 then return false; end if;
  update public.messages set status = 'CANCELLED', updated_at = now() where owner_id = v_owner_id and campaign_id = p_campaign_id and status = 'QUEUED';
  update public.campaign_recipients cr set status = 'CANCELLED' where cr.owner_id = v_owner_id and cr.campaign_id = p_campaign_id and cr.status = 'QUEUED' and not exists (select 1 from public.messages m where m.campaign_recipient_id = cr.id and m.status = 'SENDING');
  return true;
end;
$$;

create or replace function public.claim_outbox_batch(p_limit integer default 20)
returns setof public.messages language plpgsql security definer set search_path = public as $$
begin
  return query
  with candidates as (
    select m.id from public.messages m
    where m.status = 'QUEUED' and m.available_at <= now()
      and (m.campaign_id is null or exists (select 1 from public.campaigns c where c.id = m.campaign_id and c.owner_id = m.owner_id and c.status in ('QUEUED','RUNNING','SCHEDULED')))
      and (m.sequence_id is null or (exists (select 1 from public.message_sequences s where s.id = m.sequence_id and s.owner_id = m.owner_id and s.status in ('QUEUED','SENDING')) and (m.sequence_index = 0 or exists (select 1 from public.messages previous where previous.sequence_id = m.sequence_id and previous.sequence_index = m.sequence_index - 1 and previous.status = 'SENT'))))
    order by m.available_at, m.created_at, m.id for update skip locked limit greatest(1, least(p_limit, 100))
  ), claimed as (
    update public.messages m set status = 'SENDING', claimed_at = now(), attempt_count = m.attempt_count + 1, updated_at = now() from candidates c where m.id = c.id returning m.*
  ), started as (
    update public.campaigns c set status = 'RUNNING', started_at = coalesce(c.started_at, now()) from claimed m where c.id = m.campaign_id and c.status = 'SCHEDULED' returning c.id
  ), started_queued as (
    update public.campaigns c set status = 'RUNNING', started_at = coalesce(c.started_at, now()) from claimed m where c.id = m.campaign_id and c.status = 'QUEUED' returning c.id
  )
  select * from claimed;
end;
$$;

revoke all on function public.resolve_campaign_template(text,text,text) from public, anon, authenticated;
revoke all on function public.create_campaign_with_snapshot(text,jsonb,uuid[],integer) from public, anon;
grant execute on function public.create_campaign_with_snapshot(text,jsonb,uuid[],integer) to authenticated;
revoke all on function public.create_campaign_with_snapshot(text,jsonb,uuid[]) from public, anon, authenticated;
revoke all on function public.create_campaign_snapshot(uuid,uuid[]) from authenticated;
grant execute on function public.create_campaign_snapshot(uuid,uuid[]) to service_role;
revoke all on function public.schedule_campaign(uuid,timestamptz) from public, anon;
grant execute on function public.schedule_campaign(uuid,timestamptz) to authenticated;
revoke all on function public.queue_campaign(uuid) from public, anon;
grant execute on function public.queue_campaign(uuid) to authenticated;
revoke all on function public.cancel_campaign(uuid) from public, anon;
grant execute on function public.cancel_campaign(uuid) to authenticated;
revoke all on function public.claim_outbox_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_outbox_batch(integer) to service_role;
revoke all on function public.resolve_contact_ids_for_selection(text,text,uuid,text,text,uuid[]) from public, anon;
grant execute on function public.resolve_contact_ids_for_selection(text,text,uuid,text,text,uuid[]) to authenticated;
revoke all on function public.get_contacts_workspace(text,text,uuid,text,text,integer,integer) from public, anon;
grant execute on function public.get_contacts_workspace(text,text,uuid,text,text,integer,integer) to authenticated;
revoke all on function public.preflight_campaign_audience(uuid[],integer) from public, anon;
grant execute on function public.preflight_campaign_audience(uuid[],integer) to authenticated;
