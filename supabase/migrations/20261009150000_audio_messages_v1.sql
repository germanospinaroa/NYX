-- AUDIO message steps. Forward-only; do not edit or re-run applied migrations.

alter table public.messages add column if not exists media_mime_type text;
alter table public.messages add column if not exists media_duration_ms integer;
alter table public.messages drop constraint if exists messages_message_type_check;
alter table public.messages add constraint messages_message_type_check check (message_type in ('TEXT','IMAGE','AUDIO'));
alter table public.messages drop constraint if exists messages_media_metadata_check;
alter table public.messages add constraint messages_media_metadata_check check (
  (message_type = 'TEXT' and media_path is null and media_mime_type is null and media_duration_ms is null)
  or (message_type = 'IMAGE' and media_path is not null)
  or (message_type = 'AUDIO' and media_path is not null and media_mime_type in ('audio/webm','audio/ogg','audio/mp4','audio/mpeg') and (media_duration_ms is null or media_duration_ms between 1 and 3600000))
);

alter table public.campaign_sequence_steps drop constraint if exists campaign_sequence_steps_shape_check;
alter table public.campaign_sequence_steps drop constraint if exists campaign_sequence_steps_message_type_check;
alter table public.campaign_sequence_steps add constraint campaign_sequence_steps_message_type_check check (message_type in ('TEXT','IMAGE','AUDIO'));
alter table public.campaign_sequence_steps add constraint campaign_sequence_steps_shape_check check (
  (message_type = 'TEXT' and nullif(btrim(neutral_text), '') is not null and media_path is null)
  or (message_type = 'IMAGE' and nullif(btrim(media_path), '') is not null)
  or (message_type = 'AUDIO' and nullif(btrim(media_path), '') is not null and neutral_text is null and male_text is null and female_text is null and neutral_caption is null and male_caption is null and female_caption is null)
);
alter table public.campaign_sequence_steps add column if not exists media_mime_type text;
alter table public.campaign_sequence_steps add column if not exists media_duration_ms integer;
alter table public.campaign_sequence_steps add constraint campaign_sequence_steps_audio_metadata_check check (
  message_type <> 'AUDIO' or (media_mime_type in ('audio/webm','audio/ogg','audio/mp4','audio/mpeg') and (media_duration_ms is null or media_duration_ms between 1 and 3600000))
);

update storage.buckets set file_size_limit = 16777216,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','audio/webm','audio/ogg','audio/mp4','audio/mpeg']::text[]
where id = 'nyx-media';

-- Individual enqueue remains intentionally campaign_id-free. AUDIO uses its stable
-- private path and metadata; the worker resolves the signed URL at dispatch time.
create or replace function public.enqueue_message_sequence(p_contact_id uuid, p_steps jsonb, p_campaign_id uuid default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_owner_id uuid := (select auth.uid()); v_sequence_id uuid; v_step jsonb;
begin
  if v_owner_id is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000'; end if;
  if p_campaign_id is not null then raise exception 'CAMPAIGN_SEQUENCE_NOT_SUPPORTED' using errcode = '0A000'; end if;
  if jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps) < 1 or jsonb_array_length(p_steps) > 50 then raise exception 'INVALID_SEQUENCE' using errcode = '22023'; end if;
  if not exists (select 1 from public.contacts where id = p_contact_id and owner_id = v_owner_id and archived_at is null) then raise exception 'CONTACT_NOT_FOUND' using errcode = 'P0002'; end if;
  for v_step in select value from jsonb_array_elements(p_steps) loop
    if v_step->>'type' not in ('TEXT','IMAGE','AUDIO') then raise exception 'INVALID_SEQUENCE_STEP' using errcode = '22023'; end if;
    if v_step->>'type' = 'TEXT' and (nullif(btrim(coalesce(v_step->>'text','')), '') is null or length(v_step->>'text') > 10000) then raise exception 'INVALID_TEXT_STEP' using errcode = '22023'; end if;
    if v_step->>'type' in ('IMAGE','AUDIO') and (nullif(btrim(coalesce(v_step->>'mediaPath','')), '') is null or length(v_step->>'mediaPath') > 500 or left(btrim(v_step->>'mediaPath'), length(v_owner_id::text)+1) <> v_owner_id::text || '/') then raise exception 'INVALID_MEDIA_OWNER' using errcode = '22023'; end if;
    if v_step->>'type' = 'AUDIO' and v_step->>'mimeType' not in ('audio/webm','audio/ogg','audio/mp4','audio/mpeg') then raise exception 'INVALID_AUDIO_MIME' using errcode = '22023'; end if;
    if length(coalesce(v_step->>'caption','')) > 10000 or length(coalesce(v_step->>'mediaPath','')) > 500 then raise exception 'INVALID_MESSAGE_METADATA' using errcode = '22023'; end if;
  end loop;
  insert into public.message_sequences(owner_id, contact_id) values (v_owner_id, p_contact_id) returning id into v_sequence_id;
  insert into public.messages(owner_id, contact_id, sequence_id, sequence_index, destination, message_text, message_type, caption, media_path, media_mime_type, media_duration_ms)
  select v_owner_id, p_contact_id, v_sequence_id, (item.ordinality-1)::integer, c.phone_e164,
    case when item.value->>'type' = 'TEXT' then btrim(item.value->>'text') else '' end,
    item.value->>'type', nullif(item.value->>'caption',''), nullif(item.value->>'mediaPath',''), item.value->>'mimeType', nullif(item.value->>'durationMs','')::integer
  from public.contacts c, jsonb_array_elements(p_steps) with ordinality item where c.id = p_contact_id and c.owner_id = v_owner_id;
  return v_sequence_id;
end; $$;

-- Campaign creation remains the immutable snapshot boundary. AUDIO is shared by
-- all recipients and has no gender-specific variants in V1.
create or replace function public.create_campaign_with_snapshot(p_name text, p_steps jsonb, p_contact_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_owner_id uuid := (select auth.uid()); v_campaign_id uuid; v_count integer := 0; v_step jsonb;
begin
  if v_owner_id is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000'; end if;
  if p_contact_ids is null or cardinality(p_contact_ids) < 1 or cardinality(p_contact_ids) > 100000 then raise exception 'EMPTY_AUDIENCE' using errcode = '22023'; end if;
  if jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps) < 1 or jsonb_array_length(p_steps) > 50 then raise exception 'INVALID_CAMPAIGN_STEPS' using errcode = '22023'; end if;
  for v_step in select value from jsonb_array_elements(p_steps) loop
    if v_step->>'type' not in ('TEXT','IMAGE','AUDIO') then raise exception 'INVALID_CAMPAIGN_STEP' using errcode = '22023'; end if;
    if v_step->>'type' = 'TEXT' and (nullif(btrim(v_step->>'neutralText'),'') is null or length(v_step->>'neutralText') > 10000) then raise exception 'INVALID_CAMPAIGN_TEXT' using errcode = '22023'; end if;
    if v_step->>'type' in ('IMAGE','AUDIO') and (nullif(btrim(v_step->>'mediaPath'),'') is null or length(v_step->>'mediaPath') > 500 or left(btrim(v_step->>'mediaPath'), length(v_owner_id::text)+1) <> v_owner_id::text || '/') then raise exception 'INVALID_CAMPAIGN_MEDIA' using errcode = '22023'; end if;
    if v_step->>'type' = 'AUDIO' and v_step->>'mimeType' not in ('audio/webm','audio/ogg','audio/mp4','audio/mpeg') then raise exception 'INVALID_AUDIO_MIME' using errcode = '22023'; end if;
  end loop;
  insert into public.campaigns(owner_id,name,status) values (v_owner_id,nullif(btrim(coalesce(p_name,'')),''),'DRAFT') returning id into v_campaign_id;
  insert into public.campaign_sequence_steps(campaign_id,owner_id,sequence_index,message_type,neutral_text,male_text,female_text,neutral_caption,male_caption,female_caption,media_path,media_mime_type,media_duration_ms)
  select v_campaign_id,v_owner_id,(item.ordinality-1)::integer,item.value->>'type',nullif(btrim(item.value->>'neutralText'),''),nullif(btrim(item.value->>'maleText'),''),nullif(btrim(item.value->>'femaleText'),''),nullif(item.value->>'neutralCaption',''),nullif(item.value->>'maleCaption',''),nullif(item.value->>'femaleCaption',''),nullif(btrim(item.value->>'mediaPath'),''),nullif(item.value->>'mimeType',''),nullif(item.value->>'durationMs','')::integer from jsonb_array_elements(p_steps) with ordinality item;
  insert into public.campaign_recipients(campaign_id,owner_id,contact_id,gender_snapshot,phone_snapshot,resolved_message_variant)
  select v_campaign_id,v_owner_id,c.id,coalesce(c.gender,'UNKNOWN'),c.phone_e164,case when coalesce(c.gender,'UNKNOWN')='MALE' and exists(select 1 from public.campaign_sequence_steps s where s.campaign_id=v_campaign_id and nullif(s.male_text,'') is not null) then 'MALE' when coalesce(c.gender,'UNKNOWN')='FEMALE' and exists(select 1 from public.campaign_sequence_steps s where s.campaign_id=v_campaign_id and nullif(s.female_text,'') is not null) then 'FEMALE' else 'NEUTRAL' end from public.contacts c where c.owner_id=v_owner_id and c.id=any(p_contact_ids) and c.archived_at is null on conflict(campaign_id,contact_id) do nothing;
  get diagnostics v_count = row_count; if v_count=0 then raise exception 'EMPTY_AUDIENCE' using errcode='22023'; end if;
  insert into public.message_sequences(owner_id,contact_id,campaign_id,campaign_recipient_id) select cr.owner_id,cr.contact_id,cr.campaign_id,cr.id from public.campaign_recipients cr where cr.campaign_id=v_campaign_id and cr.owner_id=v_owner_id on conflict do nothing;
  insert into public.messages(owner_id,campaign_id,campaign_recipient_id,contact_id,sequence_id,sequence_index,destination,message_text,message_type,caption,media_path,media_mime_type,media_duration_ms)
  select ms.owner_id,ms.campaign_id,ms.campaign_recipient_id,ms.contact_id,ms.id,step.sequence_index,cr.phone_snapshot,case when step.message_type='TEXT' then coalesce(case cr.gender_snapshot when 'MALE' then step.male_text when 'FEMALE' then step.female_text else null end,step.neutral_text) else '' end,step.message_type,case cr.gender_snapshot when 'MALE' then coalesce(step.male_caption,step.neutral_caption) when 'FEMALE' then coalesce(step.female_caption,step.neutral_caption) else step.neutral_caption end,step.media_path,step.media_mime_type,step.media_duration_ms from public.message_sequences ms join public.campaign_recipients cr on cr.id=ms.campaign_recipient_id and cr.owner_id=ms.owner_id join public.campaign_sequence_steps step on step.campaign_id=ms.campaign_id where ms.campaign_id=v_campaign_id and ms.owner_id=v_owner_id and not exists(select 1 from public.messages existing where existing.sequence_id=ms.id);
  update public.campaigns set status='READY' where id=v_campaign_id and owner_id=v_owner_id;
  return jsonb_build_object('campaign_id',v_campaign_id,'recipients',v_count,'steps',jsonb_array_length(p_steps),'status','READY');
end; $$;

revoke all on function public.enqueue_message_sequence(uuid,jsonb,uuid) from public,anon;
grant execute on function public.enqueue_message_sequence(uuid,jsonb,uuid) to authenticated;
revoke all on function public.create_campaign_with_snapshot(text,jsonb,uuid[]) from public,anon;
grant execute on function public.create_campaign_with_snapshot(text,jsonb,uuid[]) to authenticated;
