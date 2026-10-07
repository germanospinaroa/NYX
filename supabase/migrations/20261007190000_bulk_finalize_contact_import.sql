-- NYX Phase 1: bulk staging and set-based finalization.
-- Existing rows remain excluded until explicitly staged by the new flow.

alter table public.contact_import_rows
  add column included boolean not null default false,
  add column row_is_ready boolean not null default false,
  add constraint contact_import_rows_import_row_unique unique (import_id, row_number);

alter table public.contact_imports
  add column idempotency_key uuid,
  add column staging_complete boolean not null default false;

create unique index contact_imports_owner_idempotency_unique
  on public.contact_imports (owner_id, idempotency_key)
  where idempotency_key is not null;

create unique index contact_import_rows_import_phone_unique
  on public.contact_import_rows (import_id, phone_e164)
  where included and phone_e164 is not null;

create or replace function public.finalize_contact_import(p_import_id uuid)
returns table (
  created_contacts integer,
  matched_existing_contacts integer,
  processed_rows integer
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner_id uuid := (select auth.uid());
  v_status text;
  v_created integer := 0;
  v_matched integer := 0;
  v_processed integer := 0;
begin
  if v_owner_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;

  select status
    into v_status
    from public.contact_imports
   where id = p_import_id
     and owner_id = v_owner_id
   for update;

  if not found then
    raise exception 'IMPORT_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- A repeated finalize call is safe after a lost response.
  if v_status = 'COMPLETED' then
    return query
      select ci.created_contacts, ci.matched_existing_contacts,
             (select count(*)::integer from public.contact_import_rows
               where import_id = p_import_id and owner_id = v_owner_id
                 and result in ('CREATED', 'MATCHED_EXISTING'))
        from public.contact_imports ci
       where ci.id = p_import_id and ci.owner_id = v_owner_id;
    return;
  end if;

  if v_status not in ('PROCESSING', 'PENDING') then
    raise exception 'IMPORT_NOT_FINALIZABLE' using errcode = '55000';
  end if;

  -- Insert only new contacts. The owner/phone unique constraint is the final
  -- race-safe deduplication boundary; existing names are never overwritten.
  with inserted as (
    insert into public.contacts (
      owner_id, display_name, first_name, phone_e164, phone_country
    )
    select r.owner_id, r.normalized_name, split_part(r.normalized_name, ' ', 1),
           r.phone_e164, null
      from public.contact_import_rows r
     where r.import_id = p_import_id
       and r.owner_id = v_owner_id
       and r.included
       and r.row_is_ready
       and r.result = 'VALID'
       and r.normalized_name is not null
       and r.phone_e164 is not null
    on conflict (owner_id, phone_e164) do nothing
    returning id, owner_id, phone_e164
  ), updated as (
    update public.contact_import_rows r
       set contact_id = i.id,
           result = 'CREATED'
      from inserted i
     where r.import_id = p_import_id
       and r.owner_id = v_owner_id
       and r.phone_e164 = i.phone_e164
       and r.result = 'VALID'
    returning r.id
  )
  select count(*)::integer into v_created from updated;

  -- Rows not inserted above matched a contact already owned by this user.
  update public.contact_import_rows r
     set contact_id = c.id,
         result = 'MATCHED_EXISTING'
    from public.contacts c
   where r.import_id = p_import_id
     and r.owner_id = v_owner_id
     and r.included
     and r.row_is_ready
     and r.result in ('VALID', 'MATCHED_EXISTING')
     and r.contact_id is null
     and c.owner_id = v_owner_id
     and c.phone_e164 = r.phone_e164;
  get diagnostics v_matched = row_count;

  select count(*)::integer into v_processed
    from public.contact_import_rows
   where import_id = p_import_id
     and owner_id = v_owner_id
     and result in ('CREATED', 'MATCHED_EXISTING');

  update public.contact_imports
     set status = 'COMPLETED',
         created_contacts = v_created,
         matched_existing_contacts = v_matched,
         completed_at = now()
   where id = p_import_id
     and owner_id = v_owner_id;

  return query select v_created, v_matched, v_processed;
end;
$$;

revoke all on function public.finalize_contact_import(uuid) from public;
grant execute on function public.finalize_contact_import(uuid) to authenticated;
