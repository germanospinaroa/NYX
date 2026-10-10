-- NYX Campaign Content Variants V1.
-- Forward-only. Do not apply automatically or edit historical migrations.

alter table public.campaign_sequence_steps
  add column if not exists content_variant_key text not null default 'A';
alter table public.campaign_sequence_steps
  drop constraint if exists campaign_sequence_steps_content_variant_check;
alter table public.campaign_sequence_steps
  add constraint campaign_sequence_steps_content_variant_check
  check (content_variant_key in ('A','B','C','D','E'));
alter table public.campaign_sequence_steps
  drop constraint if exists campaign_sequence_steps_unique;
alter table public.campaign_sequence_steps
  add constraint campaign_sequence_steps_variant_unique
  unique (campaign_id, content_variant_key, sequence_index);

alter table public.campaign_recipients
  add column if not exists content_variant_key text not null default 'A';
alter table public.campaign_recipients
  drop constraint if exists campaign_recipients_content_variant_check;
alter table public.campaign_recipients
  add constraint campaign_recipients_content_variant_check
  check (content_variant_key in ('A','B','C','D','E'));

create index if not exists campaign_recipients_variant_idx
  on public.campaign_recipients (campaign_id, content_variant_key);

create or replace function public.create_campaign_with_variants(
  p_name text,
  p_variants jsonb,
  p_contact_ids uuid[]
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_owner_id uuid := (select auth.uid());
  v_campaign_id uuid;
  v_recipient_count integer := 0;
  v_variant_count integer;
  v_step_count integer;
  v_variant jsonb;
  v_step jsonb;
  v_variant_key text;
  v_index integer;
begin
  if v_owner_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;
  if p_contact_ids is null or cardinality(p_contact_ids) < 1 or cardinality(p_contact_ids) > 100000 then
    raise exception 'EMPTY_AUDIENCE' using errcode = '22023';
  end if;
  if jsonb_typeof(p_variants) <> 'array' then
    raise exception 'INVALID_VARIANT_COUNT' using errcode = '22023';
  end if;
  v_variant_count := jsonb_array_length(p_variants);
  if v_variant_count < 1 or v_variant_count > 5 then
    raise exception 'INVALID_VARIANT_COUNT' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_array_elements(p_variants) item where item.value->>'key' in ('A','B','C','D','E')) <> v_variant_count then
    raise exception 'INVALID_VARIANT_KEY' using errcode = '22023';
  end if;
  if (select count(distinct item.value->>'key') from jsonb_array_elements(p_variants) item) <> v_variant_count then
    raise exception 'INVALID_VARIANT_KEY' using errcode = '22023';
  end if;
  if jsonb_typeof(p_variants->0->'steps') <> 'array' then
    raise exception 'INVALID_VARIANT_STEPS' using errcode = '22023';
  end if;
  v_step_count := jsonb_array_length(p_variants->0->'steps');
  if v_step_count < 1 or v_step_count > 50 then
    raise exception 'INVALID_VARIANT_STEPS' using errcode = '22023';
  end if;

  for v_variant in select value from jsonb_array_elements(p_variants) loop
    v_variant_key := v_variant->>'key';
    if jsonb_typeof(v_variant->'steps') <> 'array' or jsonb_array_length(v_variant->'steps') <> v_step_count then
      raise exception 'VARIANT_STEP_COUNT_MISMATCH' using errcode = '22023';
    end if;
    for v_step, v_index in
      select item.value, (item.ordinality - 1)::integer
      from jsonb_array_elements(v_variant->'steps') with ordinality item
    loop
      if v_step->>'type' not in ('TEXT','IMAGE','AUDIO') or v_step->>'type' <> p_variants->0->'steps'->v_index->>'type' then
        raise exception 'VARIANT_STEP_TYPE_MISMATCH' using errcode = '22023';
      end if;
      if v_step->>'type' = 'TEXT' then
        if nullif(btrim(v_step->>'neutralText'), '') is null or length(v_step->>'neutralText') > 10000
          or length(coalesce(v_step->>'maleText', '')) > 10000 or length(coalesce(v_step->>'femaleText', '')) > 10000 then
          raise exception 'INVALID_CAMPAIGN_TEXT' using errcode = '22023';
        end if;
        perform public.resolve_campaign_template(v_step->>'neutralText', 'placeholder', 'placeholder');
        if nullif(v_step->>'maleText', '') is not null then perform public.resolve_campaign_template(v_step->>'maleText', 'placeholder', 'placeholder'); end if;
        if nullif(v_step->>'femaleText', '') is not null then perform public.resolve_campaign_template(v_step->>'femaleText', 'placeholder', 'placeholder'); end if;
      else
        if nullif(btrim(v_step->>'mediaPath'), '') is null or length(v_step->>'mediaPath') > 500
          or left(btrim(v_step->>'mediaPath'), length(v_owner_id::text) + 1) <> (v_owner_id::text || '/') then
          raise exception 'INVALID_CAMPAIGN_MEDIA' using errcode = '22023';
        end if;
        if v_step->>'type' = 'AUDIO' and coalesce(v_step->>'mimeType', '') not in ('audio/webm','audio/ogg','audio/mp4','audio/mpeg') then
          raise exception 'INVALID_AUDIO_MIME' using errcode = '22023';
        end if;
        if v_step::text ~ '\{\{' then raise exception 'VARIABLE_NO_COMPATIBLE' using errcode = '22023'; end if;
      end if;
      if length(coalesce(v_step->>'neutralCaption', '')) > 10000 or length(coalesce(v_step->>'maleCaption', '')) > 10000 or length(coalesce(v_step->>'femaleCaption', '')) > 10000 then
        raise exception 'INVALID_CAMPAIGN_CAPTION' using errcode = '22023';
      end if;
      if nullif(v_step->>'neutralCaption', '') is not null then perform public.resolve_campaign_template(v_step->>'neutralCaption', 'placeholder', 'placeholder'); end if;
      if nullif(v_step->>'maleCaption', '') is not null then perform public.resolve_campaign_template(v_step->>'maleCaption', 'placeholder', 'placeholder'); end if;
      if nullif(v_step->>'femaleCaption', '') is not null then perform public.resolve_campaign_template(v_step->>'femaleCaption', 'placeholder', 'placeholder'); end if;
    end loop;
  end loop;

  insert into public.campaigns (owner_id, name, status)
  values (v_owner_id, nullif(btrim(coalesce(p_name, '')), ''), 'DRAFT')
  returning id into v_campaign_id;

  insert into public.campaign_sequence_steps (
    campaign_id, owner_id, content_variant_key, sequence_index, message_type,
    neutral_text, male_text, female_text, neutral_caption, male_caption, female_caption,
    media_path, media_mime_type, media_duration_ms
  )
  select v_campaign_id, v_owner_id, variant.value->>'key', (step.ordinality - 1)::integer,
    step.value->>'type', nullif(step.value->>'neutralText', ''), nullif(step.value->>'maleText', ''), nullif(step.value->>'femaleText', ''),
    nullif(step.value->>'neutralCaption', ''), nullif(step.value->>'maleCaption', ''), nullif(step.value->>'femaleCaption', ''),
    nullif(btrim(step.value->>'mediaPath'), ''), nullif(step.value->>'mimeType', ''), nullif(step.value->>'durationMs', '')::integer
  from jsonb_array_elements(p_variants) variant
  cross join lateral jsonb_array_elements(variant.value->'steps') with ordinality step;

  with eligible as (
    select c.*, row_number() over (order by md5(v_campaign_id::text || ':' || c.id::text), c.id) - 1 as assignment_index
    from public.contacts c
    where c.owner_id = v_owner_id and c.id = any(p_contact_ids) and c.archived_at is null
  ), variant_order as (
    select item.value->>'key' as content_variant_key, item.ordinality - 1 as variant_index
    from jsonb_array_elements(p_variants) with ordinality item
  )
  insert into public.campaign_recipients (
    campaign_id, owner_id, contact_id, gender_snapshot, phone_snapshot,
    first_name_snapshot, display_name_snapshot, permission_status_snapshot,
    frequency_limited, resolved_message_variant, content_variant_key
  )
  select v_campaign_id, v_owner_id, eligible.id, coalesce(eligible.gender, 'UNKNOWN'), eligible.phone_e164,
    eligible.first_name, eligible.display_name, null, false,
    case when coalesce(eligible.gender, 'UNKNOWN') = 'MALE' and exists (
      select 1 from public.campaign_sequence_steps s where s.campaign_id = v_campaign_id and s.content_variant_key = variant_order.content_variant_key and (nullif(s.male_text, '') is not null or nullif(s.male_caption, '') is not null)
    ) then 'MALE' when coalesce(eligible.gender, 'UNKNOWN') = 'FEMALE' and exists (
      select 1 from public.campaign_sequence_steps s where s.campaign_id = v_campaign_id and s.content_variant_key = variant_order.content_variant_key and (nullif(s.female_text, '') is not null or nullif(s.female_caption, '') is not null)
    ) then 'FEMALE' else 'NEUTRAL' end,
    variant_order.content_variant_key
  from eligible join variant_order on variant_order.variant_index = (eligible.assignment_index % v_variant_count);
  get diagnostics v_recipient_count = row_count;
  if v_recipient_count = 0 then raise exception 'NO_ELIGIBLE_RECIPIENTS' using errcode = '22023'; end if;

  insert into public.message_sequences (owner_id, contact_id, campaign_id, campaign_recipient_id)
  select cr.owner_id, cr.contact_id, cr.campaign_id, cr.id
  from public.campaign_recipients cr
  where cr.campaign_id = v_campaign_id and cr.owner_id = v_owner_id
  on conflict do nothing;

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
  join public.campaign_sequence_steps step on step.campaign_id = ms.campaign_id and step.owner_id = ms.owner_id and step.content_variant_key = cr.content_variant_key
  where ms.campaign_id = v_campaign_id and ms.owner_id = v_owner_id;

  update public.campaigns set status = 'READY' where id = v_campaign_id and owner_id = v_owner_id;
  return jsonb_build_object('campaign_id', v_campaign_id, 'recipients', v_recipient_count, 'steps', v_step_count, 'variants', v_variant_count, 'status', 'READY');
end;
$$;

revoke all on function public.create_campaign_with_variants(text, jsonb, uuid[]) from public, anon;
grant execute on function public.create_campaign_with_variants(text, jsonb, uuid[]) to authenticated;
