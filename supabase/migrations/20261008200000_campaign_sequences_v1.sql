-- Campaign V1: immutable recipient snapshots with one ordered sequence per recipient.
-- Forward-only. Do not edit or re-run migrations already applied remotely.

alter table public.campaign_recipients
  drop constraint if exists campaign_recipients_phone_snapshot_check;
alter table public.campaign_recipients
  add constraint campaign_recipients_phone_snapshot_check
  check (phone_snapshot ~ '^\+[1-9][0-9]{7,14}$');

create table if not exists public.campaign_sequence_steps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  sequence_index integer not null check (sequence_index >= 0 and sequence_index < 50),
  message_type text not null check (message_type in ('TEXT', 'IMAGE')),
  neutral_text text,
  male_text text,
  female_text text,
  neutral_caption text,
  male_caption text,
  female_caption text,
  media_path text,
  created_at timestamptz not null default now(),
  constraint campaign_sequence_steps_campaign_owner_fk
    foreign key (campaign_id, owner_id) references public.campaigns(id, owner_id) on delete cascade,
  constraint campaign_sequence_steps_unique
    unique (campaign_id, sequence_index),
  constraint campaign_sequence_steps_shape_check check (
    (message_type = 'TEXT' and nullif(btrim(neutral_text), '') is not null and media_path is null)
    or
    (message_type = 'IMAGE' and nullif(btrim(media_path), '') is not null)
  )
);

alter table public.message_sequences
  add column if not exists campaign_recipient_id uuid;
alter table public.message_sequences
  add constraint message_sequences_recipient_owner_fk
  foreign key (campaign_recipient_id, owner_id)
  references public.campaign_recipients(id, owner_id) on delete cascade;
create unique index if not exists message_sequences_campaign_recipient_unique
  on public.message_sequences (campaign_recipient_id)
  where campaign_recipient_id is not null;

create index if not exists campaign_sequence_steps_campaign_idx
  on public.campaign_sequence_steps (campaign_id, sequence_index);
create index if not exists campaign_sequence_steps_owner_idx
  on public.campaign_sequence_steps (owner_id, campaign_id);

alter table public.campaign_sequence_steps enable row level security;
create policy "campaign_sequence_steps_select_own"
  on public.campaign_sequence_steps for select to authenticated
  using ((select auth.uid()) = owner_id);
revoke insert, update, delete on table public.campaign_sequence_steps from anon, authenticated;

-- One capability-gated transaction creates the campaign, its template, the
-- immutable recipients, one sequence per recipient and all ordered messages.
create or replace function public.create_campaign_with_snapshot(
  p_name text,
  p_steps jsonb,
  p_contact_ids uuid[]
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_owner_id uuid := (select auth.uid());
  v_campaign_id uuid;
  v_recipient_count integer := 0;
  v_step jsonb;
begin
  if v_owner_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;
  if p_contact_ids is null or cardinality(p_contact_ids) < 1 or cardinality(p_contact_ids) > 100000 then
    raise exception 'EMPTY_AUDIENCE' using errcode = '22023';
  end if;
  if jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps) < 1 or jsonb_array_length(p_steps) > 50 then
    raise exception 'INVALID_CAMPAIGN_STEPS' using errcode = '22023';
  end if;
  for v_step in select value from jsonb_array_elements(p_steps)
  loop
    if v_step->>'type' not in ('TEXT', 'IMAGE') then
      raise exception 'INVALID_CAMPAIGN_STEP' using errcode = '22023';
    end if;
    if v_step->>'type' = 'TEXT' then
      if nullif(btrim(v_step->>'neutralText'), '') is null
        or length(v_step->>'neutralText') > 10000
        or length(coalesce(v_step->>'maleText', '')) > 10000
        or length(coalesce(v_step->>'femaleText', '')) > 10000 then
        raise exception 'INVALID_CAMPAIGN_TEXT' using errcode = '22023';
      end if;
    else
      if nullif(btrim(v_step->>'mediaPath'), '') is null
        or length(v_step->>'mediaPath') > 500
        or left(btrim(v_step->>'mediaPath'), length(v_owner_id::text) + 1) <> (v_owner_id::text || '/') then
        raise exception 'INVALID_CAMPAIGN_MEDIA' using errcode = '22023';
      end if;
    end if;
    if length(coalesce(v_step->>'neutralCaption', '')) > 10000
      or length(coalesce(v_step->>'maleCaption', '')) > 10000
      or length(coalesce(v_step->>'femaleCaption', '')) > 10000 then
      raise exception 'INVALID_CAMPAIGN_CAPTION' using errcode = '22023';
    end if;
  end loop;

  insert into public.campaigns (owner_id, name, status)
  values (v_owner_id, nullif(btrim(coalesce(p_name, '')), ''), 'DRAFT')
  returning id into v_campaign_id;

  insert into public.campaign_sequence_steps (
    campaign_id, owner_id, sequence_index, message_type,
    neutral_text, male_text, female_text,
    neutral_caption, male_caption, female_caption, media_path
  )
  select v_campaign_id, v_owner_id, (item.ordinality - 1)::integer,
    item.value->>'type',
    nullif(btrim(item.value->>'neutralText'), ''),
    nullif(btrim(item.value->>'maleText'), ''),
    nullif(btrim(item.value->>'femaleText'), ''),
    nullif(item.value->>'neutralCaption', ''),
    nullif(item.value->>'maleCaption', ''),
    nullif(item.value->>'femaleCaption', ''),
    nullif(btrim(item.value->>'mediaPath'), '')
  from jsonb_array_elements(p_steps) with ordinality item;

  insert into public.campaign_recipients (
    campaign_id, owner_id, contact_id, gender_snapshot,
    phone_snapshot, resolved_message_variant
  )
  select v_campaign_id, v_owner_id, c.id, coalesce(c.gender, 'UNKNOWN'),
    c.phone_e164,
    case
      when coalesce(c.gender, 'UNKNOWN') = 'MALE'
        and exists (select 1 from public.campaign_sequence_steps s
          where s.campaign_id = v_campaign_id and nullif(s.male_text, '') is not null)
        then 'MALE'
      when coalesce(c.gender, 'UNKNOWN') = 'FEMALE'
        and exists (select 1 from public.campaign_sequence_steps s
          where s.campaign_id = v_campaign_id and nullif(s.female_text, '') is not null)
        then 'FEMALE'
      else 'NEUTRAL'
    end
  from public.contacts c
  where c.owner_id = v_owner_id
    and c.id = any(p_contact_ids)
    and c.archived_at is null
  on conflict (campaign_id, contact_id) do nothing;
  get diagnostics v_recipient_count = row_count;
  if v_recipient_count = 0 then
    raise exception 'EMPTY_AUDIENCE' using errcode = '22023';
  end if;

  insert into public.message_sequences (
    owner_id, contact_id, campaign_id, campaign_recipient_id
  )
  select cr.owner_id, cr.contact_id, cr.campaign_id, cr.id
  from public.campaign_recipients cr
  where cr.campaign_id = v_campaign_id and cr.owner_id = v_owner_id
  on conflict do nothing;

  insert into public.messages (
    owner_id, campaign_id, campaign_recipient_id, contact_id,
    sequence_id, sequence_index, destination,
    message_text, message_type, caption, media_path
  )
  select ms.owner_id, ms.campaign_id, ms.campaign_recipient_id,
    ms.contact_id, ms.id, step.sequence_index, cr.phone_snapshot,
    case
      when step.message_type = 'TEXT' then
        coalesce(
          case cr.gender_snapshot
            when 'MALE' then step.male_text
            when 'FEMALE' then step.female_text
            else null
          end,
          step.neutral_text
        )
      else ''
    end,
    step.message_type,
    case cr.gender_snapshot
      when 'MALE' then coalesce(step.male_caption, step.neutral_caption)
      when 'FEMALE' then coalesce(step.female_caption, step.neutral_caption)
      else step.neutral_caption
    end,
    step.media_path
  from public.message_sequences ms
  join public.campaign_recipients cr
    on cr.id = ms.campaign_recipient_id and cr.owner_id = ms.owner_id
  join public.campaign_sequence_steps step
    on step.campaign_id = ms.campaign_id
  where ms.campaign_id = v_campaign_id
    and ms.owner_id = v_owner_id
    and not exists (
      select 1 from public.messages existing
      where existing.sequence_id = ms.id
    );

  update public.campaigns
  set status = 'READY'
  where id = v_campaign_id and owner_id = v_owner_id;

  return jsonb_build_object(
    'campaign_id', v_campaign_id,
    'recipients', v_recipient_count,
    'steps', jsonb_array_length(p_steps),
    'status', 'READY'
  );
end;
$$;

create or replace function public.refresh_campaign_recipient_status(
  p_campaign_recipient_id uuid
)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_owner_id uuid;
  v_next text;
begin
  -- This capability is service-role-only because it reconciles worker state.
  -- Resolve ownership from the recipient instead of requiring a user JWT.
  select owner_id into v_owner_id
  from public.campaign_recipients
  where id = p_campaign_recipient_id;
  if v_owner_id is null then
    raise exception 'RECIPIENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.messages
    where campaign_recipient_id = p_campaign_recipient_id
      and owner_id = v_owner_id and status = 'OUTCOME_UNKNOWN'
  ) then v_next := 'OUTCOME_UNKNOWN';
  elsif exists (
    select 1 from public.messages
    where campaign_recipient_id = p_campaign_recipient_id
      and owner_id = v_owner_id and status = 'FAILED'
  ) then v_next := 'FAILED';
  elsif exists (
    select 1 from public.messages
    where campaign_recipient_id = p_campaign_recipient_id
      and owner_id = v_owner_id and status = 'CANCELLED'
  ) and not exists (
    select 1 from public.messages
    where campaign_recipient_id = p_campaign_recipient_id
      and owner_id = v_owner_id and status in ('QUEUED', 'SENDING')
  ) then v_next := 'CANCELLED';
  elsif exists (
    select 1 from public.messages
    where campaign_recipient_id = p_campaign_recipient_id
      and owner_id = v_owner_id and status in ('QUEUED', 'SENDING')
  ) then v_next := 'QUEUED';
  else v_next := 'SENT';
  end if;

  update public.campaign_recipients
  set status = v_next
  where id = p_campaign_recipient_id and owner_id = v_owner_id;
  return v_next;
end;
$$;

revoke all on function public.create_campaign_with_snapshot(text, jsonb, uuid[]) from public, anon;
grant execute on function public.create_campaign_with_snapshot(text, jsonb, uuid[]) to authenticated;
-- Retire the legacy one-message campaign capability from browser users. Existing
-- administrative/service workflows remain available through service_role.
revoke execute on function public.create_campaign_snapshot(uuid, uuid[]) from authenticated;
revoke all on function public.refresh_campaign_recipient_status(uuid) from public, anon, authenticated;
grant execute on function public.refresh_campaign_recipient_status(uuid) to service_role;
