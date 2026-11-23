-- NYX campaign controls and READY editing.
-- Forward-only. Reconcile the remote migration ledger before applying.

alter table public.campaigns
  add column if not exists pause_requested boolean not null default false;

create or replace function public.pause_campaign(p_campaign_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_owner_id uuid := (select auth.uid());
  v_active integer;
begin
  if v_owner_id is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000'; end if;
  perform 1 from public.campaigns where id = p_campaign_id and owner_id = v_owner_id for update;
  if not found then return false; end if;
  select count(*) into v_active from public.messages where campaign_id = p_campaign_id and owner_id = v_owner_id and status = 'SENDING';
  update public.campaigns
    set pause_requested = true,
        status = case when v_active = 0 then 'PAUSED' else status end
    where id = p_campaign_id and owner_id = v_owner_id and status in ('QUEUED','RUNNING','PAUSED');
  return exists (select 1 from public.campaigns where id = p_campaign_id and owner_id = v_owner_id and status = 'PAUSED');
end;
$$;

create or replace function public.resume_campaign(p_campaign_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_owner_id uuid := (select auth.uid()); v_updated integer;
begin
  if v_owner_id is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000'; end if;
  update public.campaigns set status = 'QUEUED', pause_requested = false, scheduled_at = null
  where id = p_campaign_id and owner_id = v_owner_id and status = 'PAUSED';
  get diagnostics v_updated = row_count;
  if v_updated = 1 then
    update public.messages set available_at = now(), updated_at = now()
    where campaign_id = p_campaign_id and owner_id = v_owner_id and status = 'QUEUED';
    return true;
  end if;
  return exists (select 1 from public.campaigns where id = p_campaign_id and owner_id = v_owner_id and status = 'QUEUED');
end;
$$;

create or replace function public.queue_campaign(p_campaign_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_owner_id uuid := (select auth.uid()); v_updated integer;
begin
  if v_owner_id is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000'; end if;
  update public.campaigns set status = 'QUEUED', pause_requested = false, scheduled_at = null
  where id = p_campaign_id and owner_id = v_owner_id and status in ('READY','SCHEDULED');
  get diagnostics v_updated = row_count;
  if v_updated = 1 then
    update public.messages set available_at = now(), updated_at = now() where campaign_id = p_campaign_id and owner_id = v_owner_id and status = 'QUEUED';
    return true;
  end if;
  return exists (select 1 from public.campaigns where id = p_campaign_id and owner_id = v_owner_id and status = 'QUEUED');
end;
$$;

create or replace function public.claim_outbox_batch(p_limit integer default 20)
returns setof public.messages language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return query
  with candidates as (
    select m.id from public.messages m
    where m.status = 'QUEUED' and m.available_at <= now()
      and (m.campaign_id is null or exists (select 1 from public.campaigns c where c.id = m.campaign_id and c.owner_id = m.owner_id and c.status in ('QUEUED','RUNNING','SCHEDULED') and not c.pause_requested))
      and (m.sequence_id is null or (exists (select 1 from public.message_sequences s where s.id = m.sequence_id and s.owner_id = m.owner_id and s.status in ('QUEUED','SENDING')) and (m.sequence_index = 0 or exists (select 1 from public.messages previous where previous.sequence_id = m.sequence_id and previous.sequence_index = m.sequence_index - 1 and previous.status = 'SENT'))))
    order by m.available_at, m.created_at, m.id for update skip locked limit greatest(1, least(p_limit, 100))
  ), claimed as (
    update public.messages m set status = 'SENDING', claimed_at = now(), attempt_count = m.attempt_count + 1, updated_at = now() from candidates c where m.id = c.id returning m.*
  ), started as (
    update public.campaigns c set status = 'RUNNING', started_at = coalesce(c.started_at, now()) from claimed m where c.id = m.campaign_id and c.status in ('QUEUED','SCHEDULED') and not c.pause_requested returning c.id
  )
  select * from claimed;
end;
$$;

revoke all on function public.claim_outbox_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_outbox_batch(integer) to service_role;

-- Release a worker claim while serializing against campaign controls. The
-- campaign lock is acquired before the message lock to match cancel_campaign
-- and avoid a lock-order deadlock. A cancellation wins over a stale worker
-- read; pause/disconnect releases the claim back to QUEUED.
create or replace function public.release_claimed_message(p_message_id uuid)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_campaign_id uuid;
  v_campaign_status text;
  v_pause_requested boolean;
  v_message_status text;
begin
  select campaign_id into v_campaign_id
  from public.messages
  where id = p_message_id;

  if not found then return 'NOT_FOUND'; end if;

  if v_campaign_id is not null then
    select status, pause_requested into v_campaign_status, v_pause_requested
    from public.campaigns
    where id = v_campaign_id
    for update;
  end if;

  select status into v_message_status
  from public.messages
  where id = p_message_id
  for update;

  if v_message_status <> 'SENDING' then return v_message_status; end if;

  if v_campaign_status = 'CANCELLED' then
    update public.messages
    set status = 'CANCELLED', claimed_at = null, updated_at = now()
    where id = p_message_id and status = 'SENDING';
    return 'CANCELLED';
  end if;

  update public.messages
  set status = 'QUEUED', claimed_at = null, updated_at = now()
  where id = p_message_id and status = 'SENDING';
  return 'QUEUED';
end;
$$;

revoke all on function public.release_claimed_message(uuid) from public, anon, authenticated;
grant execute on function public.release_claimed_message(uuid) to service_role;

create or replace function public.cancel_campaign(p_campaign_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_owner_id uuid := (select auth.uid()); v_updated integer;
begin
  if v_owner_id is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000'; end if;
  update public.campaigns set status = 'CANCELLED', pause_requested = false
  where id = p_campaign_id and owner_id = v_owner_id and status in ('DRAFT','READY','SCHEDULED','QUEUED','RUNNING','PAUSED');
  get diagnostics v_updated = row_count;
  if v_updated = 0 then return false; end if;
  update public.messages set status = 'CANCELLED', updated_at = now() where owner_id = v_owner_id and campaign_id = p_campaign_id and status = 'QUEUED';
  update public.campaign_recipients cr set status = 'CANCELLED'
  where cr.owner_id = v_owner_id and cr.campaign_id = p_campaign_id and cr.status = 'QUEUED'
    and not exists (select 1 from public.messages m where m.campaign_recipient_id = cr.id and m.status = 'SENDING');
  return true;
end;
$$;

create or replace function public.refresh_campaign_status(p_campaign_id uuid)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_status text; v_next text;
begin
  select status into v_status from public.campaigns where id = p_campaign_id for update;
  if v_status is null or v_status in ('CANCELLED', 'COMPLETED', 'FAILED') then return v_status; end if;
  if exists (select 1 from public.messages where campaign_id = p_campaign_id and status = 'SENDING') then return v_status; end if;
  if exists (select 1 from public.campaigns where id = p_campaign_id and pause_requested) then
    update public.campaigns set status = 'PAUSED' where id = p_campaign_id and status in ('QUEUED','RUNNING');
    return 'PAUSED';
  end if;
  if exists (select 1 from public.messages where campaign_id = p_campaign_id and status = 'QUEUED') then return v_status; end if;
  if exists (select 1 from public.messages where campaign_id = p_campaign_id and status in ('FAILED','OUTCOME_UNKNOWN')) then v_next := 'FAILED'; else v_next := 'COMPLETED'; end if;
  update public.campaigns set status = v_next, completed_at = now() where id = p_campaign_id;
  return v_next;
end;
$$;

create or replace function public.update_campaign_with_variants(
  p_campaign_id uuid, p_name text, p_variants jsonb, p_contact_ids uuid[]
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_owner_id uuid := (select auth.uid());
  v_status text;
  v_variant jsonb;
  v_step jsonb;
  v_key text;
  v_index integer;
  v_variant_count integer;
  v_step_count integer;
  v_recipient_count integer := 0;
begin
  if v_owner_id is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000'; end if;
  select status into v_status from public.campaigns where id = p_campaign_id and owner_id = v_owner_id for update;
  if v_status is null then raise exception 'CAMPAIGN_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_status <> 'READY' then raise exception 'CAMPAIGN_EDIT_CLOSED' using errcode = '55000'; end if;
  if exists (select 1 from public.messages where campaign_id = p_campaign_id and owner_id = v_owner_id and (status <> 'QUEUED' or attempt_count > 0 or claimed_at is not null)) then
    raise exception 'CAMPAIGN_EDIT_CLOSED' using errcode = '55000';
  end if;
  if p_contact_ids is null or cardinality(p_contact_ids) < 1 or cardinality(p_contact_ids) > 100000 then raise exception 'EMPTY_AUDIENCE' using errcode = '22023'; end if;
  if jsonb_typeof(p_variants) <> 'array' then raise exception 'INVALID_VARIANT_COUNT' using errcode = '22023'; end if;
  v_variant_count := jsonb_array_length(p_variants);
  if v_variant_count < 1 or v_variant_count > 5 then raise exception 'INVALID_VARIANT_COUNT' using errcode = '22023'; end if;
  if jsonb_typeof(p_variants->0->'steps') <> 'array' then raise exception 'INVALID_VARIANT_STEPS' using errcode = '22023'; end if;
  v_step_count := jsonb_array_length(p_variants->0->'steps');
  if v_step_count < 1 or v_step_count > 50 then raise exception 'INVALID_VARIANT_STEPS' using errcode = '22023'; end if;
  if (select count(*) from jsonb_array_elements(p_variants) x where x.value->>'key' in ('A','B','C','D','E')) <> v_variant_count or
     (select count(distinct x.value->>'key') from jsonb_array_elements(p_variants) x) <> v_variant_count then raise exception 'INVALID_VARIANT_KEY' using errcode = '22023'; end if;
  for v_variant in select value from jsonb_array_elements(p_variants) loop
    if jsonb_typeof(v_variant->'steps') <> 'array' or jsonb_array_length(v_variant->'steps') <> v_step_count then raise exception 'VARIANT_STEP_COUNT_MISMATCH' using errcode = '22023'; end if;
    for v_step, v_index in select x.value, (x.ordinality - 1)::integer from jsonb_array_elements(v_variant->'steps') with ordinality x loop
      if v_step->>'type' not in ('TEXT','IMAGE','AUDIO') or v_step->>'type' <> p_variants->0->'steps'->v_index->>'type' then raise exception 'VARIANT_STEP_TYPE_MISMATCH' using errcode = '22023'; end if;
      if v_step->>'type' = 'TEXT' and nullif(btrim(v_step->>'neutralText'), '') is null then raise exception 'INVALID_CAMPAIGN_TEXT' using errcode = '22023'; end if;
      if v_step->>'type' in ('IMAGE','AUDIO') and (nullif(btrim(v_step->>'mediaPath'), '') is null or left(btrim(v_step->>'mediaPath'), length(v_owner_id::text) + 1) <> v_owner_id::text || '/') then raise exception 'INVALID_CAMPAIGN_MEDIA' using errcode = '22023'; end if;
      if v_step->>'type' = 'AUDIO' and coalesce(v_step->>'mimeType','') not in ('audio/webm','audio/ogg','audio/mp4','audio/mpeg') then raise exception 'INVALID_AUDIO_MIME' using errcode = '22023'; end if;
    end loop;
  end loop;

  delete from public.messages where campaign_id = p_campaign_id and owner_id = v_owner_id;
  delete from public.message_sequences where campaign_id = p_campaign_id and owner_id = v_owner_id;
  delete from public.campaign_recipients where campaign_id = p_campaign_id and owner_id = v_owner_id;
  delete from public.campaign_sequence_steps where campaign_id = p_campaign_id and owner_id = v_owner_id;
  update public.campaigns set name = nullif(btrim(coalesce(p_name, '')), ''), pause_requested = false where id = p_campaign_id and owner_id = v_owner_id;

  insert into public.campaign_sequence_steps (campaign_id, owner_id, content_variant_key, sequence_index, message_type, neutral_text, male_text, female_text, neutral_caption, male_caption, female_caption, media_path, media_mime_type, media_duration_ms)
  select p_campaign_id, v_owner_id, variant.value->>'key', (step.ordinality - 1)::integer, step.value->>'type', nullif(step.value->>'neutralText',''), nullif(step.value->>'maleText',''), nullif(step.value->>'femaleText',''), nullif(step.value->>'neutralCaption',''), nullif(step.value->>'maleCaption',''), nullif(step.value->>'femaleCaption',''), nullif(step.value->>'mediaPath',''), nullif(step.value->>'mimeType',''), nullif(step.value->>'durationMs','')::integer
  from jsonb_array_elements(p_variants) variant cross join lateral jsonb_array_elements(variant.value->'steps') with ordinality step;

  with eligible as (select c.*, row_number() over (order by md5(p_campaign_id::text || ':' || c.id::text), c.id) - 1 as assignment_index from public.contacts c join public.contact_channel_permissions cp on cp.owner_id = v_owner_id and cp.contact_id = c.id and cp.channel = 'WHATSAPP' and cp.status = 'OPTED_IN' where c.owner_id = v_owner_id and c.id = any(p_contact_ids) and c.archived_at is null), variant_order as (select x.value->>'key' as content_variant_key, x.ordinality - 1 as variant_index from jsonb_array_elements(p_variants) with ordinality x)
  insert into public.campaign_recipients (campaign_id, owner_id, contact_id, gender_snapshot, phone_snapshot, first_name_snapshot, display_name_snapshot, permission_status_snapshot, frequency_limited, resolved_message_variant, content_variant_key)
  select p_campaign_id, v_owner_id, e.id, coalesce(e.gender,'UNKNOWN'), e.phone_e164, e.first_name, e.display_name, 'OPTED_IN', false, case when coalesce(e.gender,'UNKNOWN') = 'MALE' and exists (select 1 from public.campaign_sequence_steps s where s.campaign_id = p_campaign_id and s.content_variant_key = vo.content_variant_key and nullif(s.male_text,'') is not null) then 'MALE' when coalesce(e.gender,'UNKNOWN') = 'FEMALE' and exists (select 1 from public.campaign_sequence_steps s where s.campaign_id = p_campaign_id and s.content_variant_key = vo.content_variant_key and nullif(s.female_text,'') is not null) then 'FEMALE' else 'NEUTRAL' end, vo.content_variant_key
  from eligible e join variant_order vo on vo.variant_index = (e.assignment_index % v_variant_count);
  get diagnostics v_recipient_count = row_count;
  if v_recipient_count = 0 then raise exception 'NO_ELIGIBLE_RECIPIENTS' using errcode = '22023'; end if;
  insert into public.message_sequences (owner_id, contact_id, campaign_id, campaign_recipient_id) select owner_id, contact_id, campaign_id, id from public.campaign_recipients where campaign_id = p_campaign_id and owner_id = v_owner_id;
  insert into public.messages (owner_id, campaign_id, campaign_recipient_id, contact_id, sequence_id, sequence_index, destination, message_text, message_type, caption, media_path, media_mime_type, media_duration_ms)
  select ms.owner_id, ms.campaign_id, ms.campaign_recipient_id, ms.contact_id, ms.id, step.sequence_index, cr.phone_snapshot, case when step.message_type = 'TEXT' then public.resolve_campaign_template(case cr.resolved_message_variant when 'MALE' then coalesce(step.male_text,step.neutral_text) when 'FEMALE' then coalesce(step.female_text,step.neutral_text) else step.neutral_text end, coalesce(cr.first_name_snapshot,split_part(cr.display_name_snapshot,' ',1)),cr.display_name_snapshot) else '' end, step.message_type, case when step.message_type = 'IMAGE' then public.resolve_campaign_template(case cr.resolved_message_variant when 'MALE' then coalesce(step.male_caption,step.neutral_caption) when 'FEMALE' then coalesce(step.female_caption,step.neutral_caption) else step.neutral_caption end, coalesce(cr.first_name_snapshot,split_part(cr.display_name_snapshot,' ',1)),cr.display_name_snapshot) end, step.media_path, step.media_mime_type, step.media_duration_ms
  from public.message_sequences ms join public.campaign_recipients cr on cr.id = ms.campaign_recipient_id and cr.owner_id = ms.owner_id join public.campaign_sequence_steps step on step.campaign_id = ms.campaign_id and step.owner_id = ms.owner_id and step.content_variant_key = cr.content_variant_key where ms.campaign_id = p_campaign_id and ms.owner_id = v_owner_id;
  return jsonb_build_object('campaign_id', p_campaign_id, 'recipients', v_recipient_count, 'steps', v_step_count, 'status', 'READY');
end;
$$;

revoke all on function public.update_campaign_with_variants(uuid,text,jsonb,uuid[]) from public, anon;
grant execute on function public.update_campaign_with_variants(uuid,text,jsonb,uuid[]) to authenticated;
