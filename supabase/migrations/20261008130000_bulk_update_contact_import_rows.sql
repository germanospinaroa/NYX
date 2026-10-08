-- NYX review workspace batch-save contract. Forward-only.

create or replace function public.bulk_update_contact_import_rows(
  p_import_id uuid,
  p_changes jsonb
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
  if v_owner_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;
  if jsonb_typeof(p_changes) <> 'array' then
    raise exception 'INVALID_REVIEW_CHANGES' using errcode = '22023';
  end if;
  select status into v_status
    from public.contact_imports
   where id = p_import_id and owner_id = v_owner_id
   for update;
  if not found or v_status in ('COMPLETED', 'FINALIZING') then
    raise exception 'IMPORT_NOT_REVIEWABLE' using errcode = '55000';
  end if;
  if exists (
    select 1
      from jsonb_to_recordset(p_changes) as c(
        row_id uuid,
        normalized_name text,
        first_name text,
        phone_e164 text,
        phone_country text,
        gender_final text,
        included boolean
      )
     where c.gender_final is not null
       and c.gender_final not in ('MALE', 'FEMALE', 'UNKNOWN')
  ) then
    raise exception 'INVALID_GENDER' using errcode = '22023';
  end if;

  with raw_changes as (
    select c.*
      from jsonb_to_recordset(p_changes) as c(
        row_id uuid,
        normalized_name text,
        first_name text,
        phone_e164 text,
        phone_country text,
        gender_final text,
        included boolean
      )
  ), changes as (
    select c.*,
           case
             when c.normalized_name is null or btrim(c.normalized_name) = '' then 'INVALID_NAME'
             when c.phone_e164 is null or c.phone_e164 !~ '^\+[1-9][0-9]{7,14}$' then 'INVALID_PHONE'
             when exists (
               select 1 from public.contact_import_rows duplicate
                where duplicate.import_id = p_import_id
                  and duplicate.owner_id = v_owner_id
                  and duplicate.id <> c.row_id
                  and duplicate.phone_e164 = c.phone_e164
             ) then 'DUPLICATE_IN_FILE'
             when exists (
               select 1 from raw_changes duplicate
                where duplicate.row_id <> c.row_id
                  and duplicate.phone_e164 is not null
                  and duplicate.phone_e164 ~ '^\+[1-9][0-9]{7,14}$'
                  and duplicate.phone_e164 = c.phone_e164
             ) then 'DUPLICATE_IN_FILE'
             when exists (
               select 1 from public.contacts existing
                where existing.owner_id = v_owner_id
                  and existing.phone_e164 = c.phone_e164
             ) then 'MATCHED_EXISTING'
             else 'VALID'
           end as next_result
      from raw_changes c
  )
  update public.contact_import_rows r
     set normalized_name = case when c.next_result = 'INVALID_NAME' then null else c.normalized_name end,
         phone_e164 = case when c.next_result = 'INVALID_PHONE' then null else c.phone_e164 end,
         contact_id = null,
         error_code = case when c.next_result in ('INVALID_NAME', 'INVALID_PHONE') then c.next_result else null end,
         result = c.next_result,
         gender_final = coalesce(c.gender_final, r.gender_final),
         gender_review_status = case when c.gender_final is null then r.gender_review_status else 'REVIEWED' end,
         included = c.included and c.next_result in ('VALID', 'MATCHED_EXISTING'),
         row_is_ready = c.included
           and c.next_result in ('VALID', 'MATCHED_EXISTING')
           and (case when c.gender_final is null then r.gender_review_status else 'REVIEWED' end) = 'REVIEWED'
           and coalesce(c.gender_final, r.gender_final) is not null
    from changes c
   where r.id = c.row_id
     and r.import_id = p_import_id
     and r.owner_id = v_owner_id;
  get diagnostics v_count = row_count;
  perform public.refresh_contact_import_status(p_import_id);
  return v_count;
end;
$$;

revoke execute on function public.bulk_update_contact_import_rows(uuid, jsonb) from public;
revoke execute on function public.bulk_update_contact_import_rows(uuid, jsonb) from anon;
grant execute on function public.bulk_update_contact_import_rows(uuid, jsonb) to authenticated;
