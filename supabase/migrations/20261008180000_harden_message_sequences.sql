-- Message sequence release hardening.
-- Forward-only. Do not edit or re-run migrations already applied remotely.

-- Cover the composite foreign keys; existing ordering indexes serve different
-- access patterns and do not cover these constraints.
create index if not exists message_sequences_campaign_owner_idx
  on public.message_sequences (campaign_id, owner_id);
create index if not exists message_sequences_contact_owner_idx
  on public.message_sequences (contact_id, owner_id);
create index if not exists messages_sequence_owner_idx
  on public.messages (sequence_id, owner_id);

-- Defense in depth for direct authenticated uploads. The route performs the
-- same validation before upload, while the bucket also enforces it.
update storage.buckets
set public = false,
    file_size_limit = 8388608,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[]
where id = 'nyx-media';

-- Individual sequences are the only public enqueue capability for now.
-- Campaign snapshots retain their existing immutable one-message flow.
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
begin
  if v_owner_id is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000'; end if;
  if p_campaign_id is not null then
    raise exception 'CAMPAIGN_SEQUENCE_NOT_SUPPORTED' using errcode = '0A000';
  end if;
  if jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps) < 1 or jsonb_array_length(p_steps) > 50 then
    raise exception 'INVALID_SEQUENCE' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.contacts
    where id = p_contact_id and owner_id = v_owner_id and archived_at is null
  ) then
    raise exception 'CONTACT_NOT_FOUND' using errcode = 'P0002';
  end if;
  for v_step in select value from jsonb_array_elements(p_steps)
  loop
    if v_step->>'type' not in ('TEXT', 'IMAGE') then
      raise exception 'INVALID_SEQUENCE_STEP' using errcode = '22023';
    end if;
    if v_step->>'type' = 'TEXT' then
      if nullif(btrim(coalesce(v_step->>'text', '')), '') is null
        or length(v_step->>'text') > 10000 then
        raise exception 'INVALID_TEXT_STEP' using errcode = '22023';
      end if;
    else
      if nullif(btrim(coalesce(v_step->>'mediaPath', '')), '') is null
        or length(v_step->>'mediaPath') > 500
        or left(btrim(v_step->>'mediaPath'), length(v_owner_id::text) + 1) <> (v_owner_id::text || '/') then
        raise exception 'INVALID_MEDIA_OWNER' using errcode = '22023';
      end if;
    end if;
    if length(coalesce(v_step->>'caption', '')) > 10000 then
      raise exception 'INVALID_CAPTION' using errcode = '22023';
    end if;
  end loop;
  insert into public.message_sequences (owner_id, contact_id, campaign_id)
  values (v_owner_id, p_contact_id, null)
  returning id into v_sequence_id;
  insert into public.messages
    (owner_id, contact_id, sequence_id, sequence_index, destination,
     message_text, message_type, caption, media_path)
  select v_owner_id, p_contact_id, v_sequence_id, (item.ordinality - 1)::integer,
    c.phone_e164,
    case when item.value->>'type' = 'TEXT' then btrim(item.value->>'text') else '' end,
    item.value->>'type',
    nullif(item.value->>'caption', ''),
    nullif(item.value->>'mediaPath', '')
  from public.contacts c, jsonb_array_elements(p_steps) with ordinality item
  where c.id = p_contact_id and c.owner_id = v_owner_id;
  return v_sequence_id;
end;
$$;

-- Keep the legacy entry point, but preserve its text as image caption.
create or replace function public.enqueue_single_message(
  p_contact_id uuid,
  p_message_text text,
  p_media_path text default null
)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_media_path is null then
    return public.enqueue_message_sequence(
      p_contact_id,
      jsonb_build_array(jsonb_build_object('type', 'TEXT', 'text', coalesce(p_message_text, '')))
    );
  end if;
  return public.enqueue_message_sequence(
    p_contact_id,
    jsonb_build_array(jsonb_build_object(
      'type', 'IMAGE',
      'caption', coalesce(p_message_text, ''),
      'mediaPath', p_media_path
    ))
  );
end;
$$;

-- Terminal outcomes take precedence over queued work. Pending steps are
-- cancelled only after the sequence has a terminal failure, never SENDING.
create or replace function public.refresh_message_sequence_status(p_sequence_id uuid)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_next text;
  v_current text;
begin
  select status into v_current
  from public.message_sequences
  where id = p_sequence_id
  for update;
  if v_current is null then return null; end if;
  if exists (select 1 from public.messages where sequence_id = p_sequence_id and status = 'OUTCOME_UNKNOWN') then
    v_next := 'OUTCOME_UNKNOWN';
  elsif exists (select 1 from public.messages where sequence_id = p_sequence_id and status = 'FAILED') then
    v_next := 'FAILED';
  elsif exists (select 1 from public.messages where sequence_id = p_sequence_id and status = 'CANCELLED') then
    v_next := 'CANCELLED';
  elsif exists (select 1 from public.messages where sequence_id = p_sequence_id and status in ('QUEUED', 'SENDING')) then
    update public.message_sequences
    set status = 'SENDING', started_at = coalesce(started_at, now()), updated_at = now()
    where id = p_sequence_id and status not in ('SENT', 'FAILED', 'OUTCOME_UNKNOWN', 'CANCELLED');
    return 'SENDING';
  else
    v_next := 'SENT';
  end if;
  if v_next <> 'SENT' then
    update public.messages
    set status = 'CANCELLED', updated_at = now()
    where sequence_id = p_sequence_id and status = 'QUEUED';
  end if;
  update public.message_sequences
  set status = v_next, completed_at = now(), updated_at = now()
  where id = p_sequence_id;
  return v_next;
end;
$$;

-- A sequence message is eligible only while its sequence is active and only
-- when it is the first step or follows a committed SENT predecessor.
create or replace function public.claim_outbox_batch(p_limit integer default 20)
returns setof public.messages language plpgsql security definer set search_path = public, pg_temp as $$
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
      and (
        m.sequence_id is null
        or (
          exists (
            select 1 from public.message_sequences s
            where s.id = m.sequence_id and s.owner_id = m.owner_id
              and s.status in ('QUEUED', 'SENDING')
          )
          and (
            m.sequence_index = 0
            or exists (
              select 1 from public.messages previous
              where previous.sequence_id = m.sequence_id
                and previous.sequence_index = m.sequence_index - 1
                and previous.status = 'SENT'
            )
          )
        )
      )
    order by m.available_at, m.created_at, m.id
    for update skip locked
    limit greatest(1, least(p_limit, 100))
  ), claimed as (
    update public.messages m
    set status = 'SENDING', claimed_at = now(),
        attempt_count = m.attempt_count + 1, updated_at = now()
    from candidates c
    where m.id = c.id
    returning m.*
  ), started as (
    update public.message_sequences s
    set status = 'SENDING', started_at = coalesce(s.started_at, now()), updated_at = now()
    from claimed c
    where s.id = c.sequence_id and s.status = 'QUEUED'
  )
  select * from claimed;
end;
$$;

revoke all on function public.enqueue_message_sequence(uuid, jsonb, uuid) from public, anon;
grant execute on function public.enqueue_message_sequence(uuid, jsonb, uuid) to authenticated;
revoke all on function public.enqueue_single_message(uuid, text, text) from public, anon;
grant execute on function public.enqueue_single_message(uuid, text, text) to authenticated;
revoke all on function public.refresh_message_sequence_status(uuid) from public, anon, authenticated;
grant execute on function public.refresh_message_sequence_status(uuid) to service_role;
revoke all on function public.claim_outbox_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_outbox_batch(integer) to service_role;
