-- Campaign permission gating is intentionally removed from NYX.
-- Historical permission rows/columns are retained for non-destructive compatibility, but they no longer affect campaign selection or eligibility.

create or replace function public.preflight_campaign_audience(p_contact_ids uuid[], p_frequency_cap_days integer)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare v_result jsonb;
begin
  if (select auth.uid()) is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000'; end if;
  if p_frequency_cap_days is null or p_frequency_cap_days not between 1 and 90 then raise exception 'INVALID_FREQUENCY_CAP' using errcode = '22023'; end if;
  with selected as (
    select distinct c.id, c.first_name, c.display_name, c.gender,
      exists (select 1 from public.messages m where m.owner_id = c.owner_id and m.contact_id = c.id and m.campaign_id is not null and m.status = 'SENT' and m.sent_at >= now() - make_interval(days => p_frequency_cap_days)) as recently_contacted
    from public.contacts c
    where c.owner_id = (select auth.uid()) and c.id = any(p_contact_ids) and c.archived_at is null
  ), eligible as (
    select * from selected where not recently_contacted
  )
  select jsonb_build_object(
    'selected', (select count(*) from selected),
    'recent', (select count(*) from selected where recently_contacted),
    'eligible', (select count(*) from eligible),
    'samples', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'first_name', first_name, 'display_name', display_name, 'gender', gender)) from (select * from eligible order by display_name, id limit 5) sample), '[]'::jsonb)
  ) into v_result;
  return v_result;
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
    c.first_name, c.display_name, null, false,
    case when coalesce(c.gender, 'UNKNOWN') = 'MALE' and exists (select 1 from public.campaign_sequence_steps s where s.campaign_id = v_campaign_id and (nullif(s.male_text, '') is not null or nullif(s.male_caption, '') is not null)) then 'MALE'
         when coalesce(c.gender, 'UNKNOWN') = 'FEMALE' and exists (select 1 from public.campaign_sequence_steps s where s.campaign_id = v_campaign_id and (nullif(s.female_text, '') is not null or nullif(s.female_caption, '') is not null)) then 'FEMALE'
         else 'NEUTRAL' end
  from public.contacts c
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

