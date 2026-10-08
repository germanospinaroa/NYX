-- NYX Phase 1 review workspace. Forward-only; do not edit applied migrations.

alter table public.contact_imports drop constraint if exists contact_imports_status_check;
alter table public.contact_imports
  add constraint contact_imports_status_check
  check (status in ('PENDING', 'ANALYZING', 'STAGING', 'REVIEW_REQUIRED',
                    'READY_TO_FINALIZE', 'FINALIZING', 'PROCESSING',
                    'COMPLETED', 'FAILED'));

alter table public.contacts
  add column if not exists gender text,
  add column if not exists gender_reviewed boolean not null default false;
alter table public.contacts drop constraint if exists contacts_gender_check;
alter table public.contacts
  add constraint contacts_gender_check check (gender is null or gender in ('MALE', 'FEMALE', 'UNKNOWN'));

alter table public.contact_import_rows
  add column if not exists gender_suggestion text,
  add column if not exists gender_confidence text,
  add column if not exists gender_final text,
  add column if not exists gender_review_status text not null default 'PENDING';

alter table public.contact_import_rows drop constraint if exists contact_import_rows_gender_suggestion_check;
alter table public.contact_import_rows
  add constraint contact_import_rows_gender_suggestion_check
  check (gender_suggestion is null or gender_suggestion in ('MALE', 'FEMALE', 'UNKNOWN'));
alter table public.contact_import_rows drop constraint if exists contact_import_rows_gender_confidence_check;
alter table public.contact_import_rows
  add constraint contact_import_rows_gender_confidence_check
  check (gender_confidence is null or gender_confidence in ('HIGH', 'MEDIUM', 'LOW'));
alter table public.contact_import_rows drop constraint if exists contact_import_rows_gender_final_check;
alter table public.contact_import_rows
  add constraint contact_import_rows_gender_final_check
  check (gender_final is null or gender_final in ('MALE', 'FEMALE', 'UNKNOWN'));
alter table public.contact_import_rows drop constraint if exists contact_import_rows_gender_review_status_check;
alter table public.contact_import_rows
  add constraint contact_import_rows_gender_review_status_check
  check (gender_review_status in ('PENDING', 'REVIEWED'));
alter table public.contact_import_rows drop constraint if exists contact_import_rows_phone_e164_format;
alter table public.contact_import_rows
  add constraint contact_import_rows_phone_e164_format
  check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$');
alter table public.contact_import_rows drop constraint if exists contact_import_rows_included_result_check;
alter table public.contact_import_rows
  add constraint contact_import_rows_included_result_check
  check (not included or result in ('VALID', 'MATCHED_EXISTING'));
alter table public.contact_import_rows drop constraint if exists contact_import_rows_ready_check;
alter table public.contact_import_rows
  add constraint contact_import_rows_ready_check
  check (not row_is_ready or (included and result in ('VALID', 'MATCHED_EXISTING')
    and gender_review_status = 'REVIEWED' and gender_final is not null));

create index if not exists contact_import_rows_owner_id_idx on public.contact_import_rows (owner_id);
create index if not exists contact_import_rows_import_owner_idx on public.contact_import_rows (import_id, owner_id);
create index if not exists contact_import_rows_contact_owner_idx on public.contact_import_rows (contact_id, owner_id);
create index if not exists contact_import_rows_review_idx
  on public.contact_import_rows (import_id, included, row_is_ready, gender_review_status);

create or replace function public.refresh_contact_import_status(p_import_id uuid)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner_id uuid := (select auth.uid());
  v_status text;
begin
  if v_owner_id is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000'; end if;
  select status into v_status from public.contact_imports
   where id = p_import_id and owner_id = v_owner_id for update;
  if not found then raise exception 'IMPORT_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_status in ('COMPLETED', 'FINALIZING') then return v_status; end if;
  update public.contact_imports
     set status = case when exists (
       select 1 from public.contact_import_rows r
        where r.import_id = p_import_id and r.owner_id = v_owner_id
          and r.included and r.result in ('VALID', 'MATCHED_EXISTING')
          and not (r.gender_review_status = 'REVIEWED' and r.gender_final is not null)
     ) then 'REVIEW_REQUIRED' else 'READY_TO_FINALIZE' end
   where id = p_import_id and owner_id = v_owner_id;
  select status into v_status from public.contact_imports where id = p_import_id and owner_id = v_owner_id;
  return v_status;
end;
$$;

create or replace function public.resolve_contact_import_existing(p_import_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner_id uuid := (select auth.uid());
  v_count integer := 0;
begin
  if v_owner_id is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000'; end if;
  update public.contact_import_rows r
     set contact_id = c.id, result = 'MATCHED_EXISTING'
    from public.contacts c
   where r.import_id = p_import_id and r.owner_id = v_owner_id
     and r.result = 'VALID' and r.contact_id is null
     and r.phone_e164 is not null and c.owner_id = v_owner_id and c.phone_e164 = r.phone_e164;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.bulk_review_contact_import_rows(
  p_import_id uuid,
  p_row_ids uuid[],
  p_action text
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner_id uuid := (select auth.uid());
  v_status text;
  v_count integer := 0;
begin
  if v_owner_id is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000'; end if;
  select status into v_status from public.contact_imports where id = p_import_id and owner_id = v_owner_id;
  if not found or v_status in ('COMPLETED', 'FINALIZING') then raise exception 'IMPORT_NOT_REVIEWABLE' using errcode = '55000'; end if;
  if p_action not in ('ACCEPT_SUGGESTION', 'ACCEPT_HIGH', 'MARK_REVIEWED', 'EXCLUDE', 'INCLUDE') then
    raise exception 'INVALID_REVIEW_ACTION' using errcode = '22023';
  end if;

  if p_action = 'ACCEPT_SUGGESTION' then
    update public.contact_import_rows r
       set gender_final = coalesce(r.gender_suggestion, 'UNKNOWN'),
           gender_review_status = 'REVIEWED',
           row_is_ready = r.included and r.result in ('VALID', 'MATCHED_EXISTING')
     where r.import_id = p_import_id and r.owner_id = v_owner_id and r.id = any(p_row_ids);
  elsif p_action = 'ACCEPT_HIGH' then
    update public.contact_import_rows r
       set gender_final = coalesce(r.gender_suggestion, 'UNKNOWN'),
           gender_review_status = 'REVIEWED',
           row_is_ready = r.included and r.result in ('VALID', 'MATCHED_EXISTING')
     where r.import_id = p_import_id and r.owner_id = v_owner_id and r.id = any(p_row_ids)
       and r.gender_confidence = 'HIGH';
  elsif p_action = 'MARK_REVIEWED' then
    update public.contact_import_rows r
       set gender_final = coalesce(r.gender_final, 'UNKNOWN'),
           gender_review_status = 'REVIEWED',
           row_is_ready = r.included and r.result in ('VALID', 'MATCHED_EXISTING')
     where r.import_id = p_import_id and r.owner_id = v_owner_id and r.id = any(p_row_ids);
  elsif p_action = 'EXCLUDE' then
    update public.contact_import_rows r set included = false, row_is_ready = false
     where r.import_id = p_import_id and r.owner_id = v_owner_id and r.id = any(p_row_ids);
  elsif p_action = 'INCLUDE' then
    update public.contact_import_rows r
       set included = true,
           row_is_ready = r.gender_review_status = 'REVIEWED'
             and r.gender_final is not null and r.result in ('VALID', 'MATCHED_EXISTING')
     where r.import_id = p_import_id and r.owner_id = v_owner_id and r.id = any(p_row_ids)
       and r.result in ('VALID', 'MATCHED_EXISTING');
  end if;
  get diagnostics v_count = row_count;
  perform public.refresh_contact_import_status(p_import_id);
  return v_count;
end;
$$;

create or replace function public.update_contact_import_row(
  p_import_id uuid,
  p_row_id uuid,
  p_normalized_name text,
  p_first_name text,
  p_phone_e164 text,
  p_phone_country text,
  p_result text,
  p_error_code text,
  p_gender_final text,
  p_included boolean
)
returns public.contact_import_rows
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner_id uuid := (select auth.uid());
  v_status text;
  v_row public.contact_import_rows;
begin
  if v_owner_id is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000'; end if;
  select status into v_status from public.contact_imports where id = p_import_id and owner_id = v_owner_id;
  if not found or v_status in ('COMPLETED', 'FINALIZING') then raise exception 'IMPORT_NOT_REVIEWABLE' using errcode = '55000'; end if;
  if p_result not in ('VALID', 'MATCHED_EXISTING', 'DUPLICATE_IN_FILE', 'INVALID_NAME', 'INVALID_PHONE') then
    raise exception 'INVALID_ROW_RESULT' using errcode = '22023';
  end if;
  update public.contact_import_rows r
     set normalized_name = p_normalized_name,
         contact_id = null,
         phone_e164 = p_phone_e164,
         error_code = p_error_code,
         result = p_result,
         gender_final = coalesce(p_gender_final, r.gender_final),
         gender_review_status = case when p_gender_final is null then r.gender_review_status else 'REVIEWED' end,
         included = p_included and p_result in ('VALID', 'MATCHED_EXISTING'),
         row_is_ready = p_included and p_result in ('VALID', 'MATCHED_EXISTING')
           and (case when p_gender_final is null then r.gender_review_status else 'REVIEWED' end) = 'REVIEWED'
           and coalesce(p_gender_final, r.gender_final) is not null
   where r.id = p_row_id and r.import_id = p_import_id and r.owner_id = v_owner_id
   returning r.* into v_row;
  if not found then raise exception 'IMPORT_ROW_NOT_FOUND' using errcode = 'P0002'; end if;
  perform public.refresh_contact_import_status(p_import_id);
  return v_row;
end;
$$;

create or replace function public.get_contact_import_review(
  p_import_id uuid,
  p_page integer default 0,
  p_page_size integer default 50,
  p_filter text default 'ALL',
  p_query text default ''
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner_id uuid := (select auth.uid());
  v_offset integer := greatest(p_page, 0) * least(greatest(p_page_size, 1), 100);
  v_limit integer := least(greatest(p_page_size, 1), 100);
  v_query text := '%' || lower(coalesce(p_query, '')) || '%';
  v_import public.contact_imports;
begin
  if v_owner_id is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000'; end if;
  select * into v_import from public.contact_imports where id = p_import_id and owner_id = v_owner_id;
  if not found then raise exception 'IMPORT_NOT_FOUND' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'import', jsonb_build_object('id', v_import.id, 'status', v_import.status, 'total_rows', v_import.total_rows),
    'summary', jsonb_build_object(
      'total', (select count(*) from public.contact_import_rows where import_id = p_import_id and owner_id = v_owner_id),
      'ready', (select count(*) from public.contact_import_rows where import_id = p_import_id and owner_id = v_owner_id and included and row_is_ready),
      'requiresReview', (select count(*) from public.contact_import_rows where import_id = p_import_id and owner_id = v_owner_id and included and result in ('VALID', 'MATCHED_EXISTING') and not row_is_ready),
      'invalid', (select count(*) from public.contact_import_rows where import_id = p_import_id and owner_id = v_owner_id and result in ('INVALID_NAME', 'INVALID_PHONE')),
      'duplicates', (select count(*) from public.contact_import_rows where import_id = p_import_id and owner_id = v_owner_id and result = 'DUPLICATE_IN_FILE'),
      'existing', (select count(*) from public.contact_import_rows where import_id = p_import_id and owner_id = v_owner_id and result = 'MATCHED_EXISTING'),
      'excluded', (select count(*) from public.contact_import_rows where import_id = p_import_id and owner_id = v_owner_id and not included)
    ),
    'rows', coalesce((select jsonb_agg(to_jsonb(r) order by r.row_number) from (
      select id, row_number, raw_name, raw_phone, normalized_name, phone_e164, result,
             error_code, gender_suggestion, gender_confidence, gender_final,
             gender_review_status, included, row_is_ready
        from public.contact_import_rows
       where import_id = p_import_id and owner_id = v_owner_id
         and (p_query = '' or lower(coalesce(raw_name, '') || ' ' || coalesce(normalized_name, '') || ' ' || coalesce(raw_phone, '') || ' ' || coalesce(phone_e164, '')) like v_query)
         and (p_filter = 'ALL'
           or (p_filter = 'READY' and included and row_is_ready)
           or (p_filter = 'REVIEW_REQUIRED' and included and not row_is_ready and result in ('VALID', 'MATCHED_EXISTING'))
           or (p_filter = 'INVALID' and result in ('INVALID_NAME', 'INVALID_PHONE'))
           or (p_filter = 'DUPLICATE' and result = 'DUPLICATE_IN_FILE')
           or (p_filter = 'EXISTING' and result = 'MATCHED_EXISTING')
           or (p_filter = 'EXCLUDED' and not included))
       order by row_number offset v_offset limit v_limit
    ) r), '[]'::jsonb),
    'page', greatest(p_page, 0), 'pageSize', v_limit
  );
end;
$$;

create table if not exists public.labels (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  color text,
  created_at timestamptz not null default now(),
  constraint labels_owner_name_unique unique (owner_id, normalized_name),
  constraint labels_id_owner_unique unique (id, owner_id)
);

create table if not exists public.contact_labels (
  owner_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null,
  label_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, contact_id, label_id),
  constraint contact_labels_contact_owner_fk foreign key (contact_id, owner_id)
    references public.contacts(id, owner_id) on delete cascade,
  constraint contact_labels_label_owner_fk foreign key (label_id, owner_id)
    references public.labels(id, owner_id) on delete cascade
);

create index if not exists labels_owner_id_idx on public.labels (owner_id);
create index if not exists contact_labels_contact_idx on public.contact_labels (contact_id, owner_id);
create index if not exists contact_labels_label_idx on public.contact_labels (label_id, owner_id);

alter table public.labels enable row level security;
alter table public.contact_labels enable row level security;
create policy "labels_select_own" on public.labels for select using ((select auth.uid()) = owner_id);
create policy "labels_insert_own" on public.labels for insert with check ((select auth.uid()) = owner_id);
create policy "labels_update_own" on public.labels for update using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "labels_delete_own" on public.labels for delete using ((select auth.uid()) = owner_id);
create policy "contact_labels_select_own" on public.contact_labels for select using ((select auth.uid()) = owner_id);
create policy "contact_labels_insert_own" on public.contact_labels for insert with check ((select auth.uid()) = owner_id);
create policy "contact_labels_delete_own" on public.contact_labels for delete using ((select auth.uid()) = owner_id);

create or replace function public.bulk_set_contact_label(p_label_id uuid, p_contact_ids uuid[], p_action text)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare v_owner_id uuid := (select auth.uid()); v_count integer := 0;
begin
  if v_owner_id is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000'; end if;
  if p_action not in ('ADD', 'REMOVE') then raise exception 'INVALID_LABEL_ACTION' using errcode = '22023'; end if;
  if not exists (select 1 from public.labels where id = p_label_id and owner_id = v_owner_id) then raise exception 'LABEL_NOT_FOUND' using errcode = 'P0002'; end if;
  if p_action = 'ADD' then
    insert into public.contact_labels (owner_id, contact_id, label_id)
      select v_owner_id, c.id, p_label_id from public.contacts c
       where c.owner_id = v_owner_id and c.id = any(p_contact_ids)
      on conflict do nothing;
  else
    delete from public.contact_labels where owner_id = v_owner_id and label_id = p_label_id and contact_id = any(p_contact_ids);
  end if;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.bulk_update_contact_gender(p_contact_ids uuid[], p_gender text)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare v_owner_id uuid := (select auth.uid()); v_count integer := 0;
begin
  if v_owner_id is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000'; end if;
  if p_gender not in ('MALE', 'FEMALE', 'UNKNOWN') then raise exception 'INVALID_GENDER' using errcode = '22023'; end if;
  update public.contacts set gender = p_gender, gender_reviewed = true
   where owner_id = v_owner_id and id = any(p_contact_ids);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.refresh_contact_import_status(uuid) from public;
revoke all on function public.resolve_contact_import_existing(uuid) from public;
revoke all on function public.bulk_review_contact_import_rows(uuid, uuid[], text) from public;
revoke all on function public.update_contact_import_row(uuid, uuid, text, text, text, text, text, text, text, boolean) from public;
revoke all on function public.get_contact_import_review(uuid, integer, integer, text, text) from public;
revoke all on function public.bulk_set_contact_label(uuid, uuid[], text) from public;
revoke all on function public.bulk_update_contact_gender(uuid[], text) from public;
grant execute on function public.refresh_contact_import_status(uuid) to authenticated;
grant execute on function public.resolve_contact_import_existing(uuid) to authenticated;
grant execute on function public.bulk_review_contact_import_rows(uuid, uuid[], text) to authenticated;
grant execute on function public.update_contact_import_row(uuid, uuid, text, text, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.get_contact_import_review(uuid, integer, integer, text, text) to authenticated;
grant execute on function public.bulk_set_contact_label(uuid, uuid[], text) to authenticated;
grant execute on function public.bulk_update_contact_gender(uuid[], text) to authenticated;

create or replace function public.finalize_contact_import(p_import_id uuid)
returns table (created_contacts integer, matched_existing_contacts integer, processed_rows integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner_id uuid := (select auth.uid()); v_status text; v_created integer := 0; v_matched integer := 0; v_processed integer := 0;
begin
  if v_owner_id is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000'; end if;
  select status into v_status from public.contact_imports where id = p_import_id and owner_id = v_owner_id for update;
  if not found then raise exception 'IMPORT_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_status = 'COMPLETED' then
    return query select ci.created_contacts, ci.matched_existing_contacts,
      (select count(*)::integer from public.contact_import_rows where import_id = p_import_id and owner_id = v_owner_id and included and row_is_ready and result in ('CREATED', 'MATCHED_EXISTING'))
      from public.contact_imports ci where ci.id = p_import_id and ci.owner_id = v_owner_id;
    return;
  end if;
  if v_status not in ('READY_TO_FINALIZE', 'REVIEW_REQUIRED') then raise exception 'IMPORT_NOT_FINALIZABLE' using errcode = '55000'; end if;
  if exists (select 1 from public.contact_import_rows r
    where r.import_id = p_import_id and r.owner_id = v_owner_id and r.included
      and (r.result not in ('VALID', 'MATCHED_EXISTING') or not r.row_is_ready)) then
    raise exception 'IMPORT_INVALID_INCLUDED_ROWS' using errcode = '55000';
  end if;
  if exists (select 1 from public.contact_import_rows r where r.import_id = p_import_id and r.owner_id = v_owner_id and r.included and r.result in ('VALID', 'MATCHED_EXISTING') and not r.row_is_ready) then
    raise exception 'IMPORT_REVIEW_REQUIRED' using errcode = '55000';
  end if;
  update public.contact_imports set status = 'FINALIZING' where id = p_import_id and owner_id = v_owner_id;
  with inserted as (
    insert into public.contacts (owner_id, display_name, first_name, phone_e164, phone_country, gender, gender_reviewed)
    select r.owner_id, r.normalized_name, split_part(r.normalized_name, ' ', 1), r.phone_e164, null, r.gender_final, true
      from public.contact_import_rows r where r.import_id = p_import_id and r.owner_id = v_owner_id and r.included and r.row_is_ready and r.result = 'VALID' and r.normalized_name is not null and r.phone_e164 is not null
      on conflict (owner_id, phone_e164) do nothing returning id, owner_id, phone_e164
  ), updated as (
    update public.contact_import_rows r set contact_id = i.id, result = 'CREATED'
      from inserted i where r.import_id = p_import_id and r.owner_id = v_owner_id and r.phone_e164 = i.phone_e164 and r.result = 'VALID' and r.included and r.row_is_ready returning r.id
  ) select count(*)::integer into v_created from updated;
  update public.contact_import_rows r set contact_id = c.id, result = 'MATCHED_EXISTING'
    from public.contacts c where r.import_id = p_import_id and r.owner_id = v_owner_id and r.included and r.row_is_ready and r.result in ('VALID', 'MATCHED_EXISTING') and r.contact_id is null and c.owner_id = v_owner_id and c.phone_e164 = r.phone_e164;
  get diagnostics v_matched = row_count;
  select count(*)::integer into v_matched from public.contact_import_rows
   where import_id = p_import_id and owner_id = v_owner_id
     and included and row_is_ready and result = 'MATCHED_EXISTING' and contact_id is not null;
  select count(*)::integer into v_processed from public.contact_import_rows where import_id = p_import_id and owner_id = v_owner_id and included and row_is_ready and result in ('CREATED', 'MATCHED_EXISTING');
  update public.contact_imports set status = 'COMPLETED', created_contacts = v_created, matched_existing_contacts = v_matched, completed_at = now() where id = p_import_id and owner_id = v_owner_id;
  return query select v_created, v_matched, v_processed;
end;
$$;
revoke all on function public.finalize_contact_import(uuid) from public;
grant execute on function public.finalize_contact_import(uuid) to authenticated;
