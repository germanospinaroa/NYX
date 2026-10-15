-- NYX alphabetical ordering for people lists. Forward-only; do not apply automatically.
-- This migration changes ordering only. It does not alter contact data or schema.

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
  order by lower(translate(btrim(coalesce(c.display_name, '')), 'áàäâéèëêíìïîóòöôúùüûñ', 'aaaaeeeeiiiioooouuuun')) asc, c.id asc;
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
    from filtered
    order by lower(translate(btrim(coalesce(display_name, '')), 'áàäâéèëêíìïîóòöôúùüûñ', 'aaaaeeeeiiiioooouuuun')) asc, id asc
    offset greatest(p_page, 0) * least(greatest(p_page_size, 1), 100)
    limit least(greatest(p_page_size, 1), 100)
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
    'samples', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'first_name', first_name, 'display_name', display_name, 'gender', gender)) from (select * from eligible order by lower(translate(btrim(coalesce(display_name, '')), 'áàäâéèëêíìïîóòöôúùüûñ', 'aaaaeeeeiiiioooouuuun')) asc, id asc limit 5) sample), '[]'::jsonb)
  ) into v_result;
  return v_result;
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
    'rows', coalesce((select jsonb_agg(to_jsonb(r) - 'sort_key' order by r.sort_key, r.row_number, r.id) from (
      select id, row_number, raw_name, raw_phone, normalized_name, phone_e164, result,
             error_code, gender_suggestion, gender_confidence, gender_final,
             gender_review_status, included, row_is_ready,
             lower(translate(btrim(coalesce(nullif(normalized_name, ''), nullif(raw_name, ''), '')), 'áàäâéèëêíìïîóòöôúùüûñ', 'aaaaeeeeiiiioooouuuun')) as sort_key
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
       order by sort_key, row_number, id
       offset v_offset limit v_limit
    ) r), '[]'::jsonb),
    'page', greatest(p_page, 0), 'pageSize', v_limit
  );
end;
$$;

revoke all on function public.resolve_contact_ids_for_selection(text, text, uuid, text, text, uuid[]) from public, anon;
grant execute on function public.resolve_contact_ids_for_selection(text, text, uuid, text, text, uuid[]) to authenticated;
revoke all on function public.get_contacts_workspace(text, text, uuid, text, text, integer, integer) from public, anon;
grant execute on function public.get_contacts_workspace(text, text, uuid, text, text, integer, integer) to authenticated;
revoke all on function public.preflight_campaign_audience(uuid[], integer) from public, anon;
grant execute on function public.preflight_campaign_audience(uuid[], integer) to authenticated;
revoke all on function public.get_contact_import_review(uuid, integer, integer, text, text) from public, anon;
grant execute on function public.get_contact_import_review(uuid, integer, integer, text, text) to authenticated;
