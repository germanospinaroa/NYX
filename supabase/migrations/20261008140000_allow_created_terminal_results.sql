-- Forward-only hardening: CREATED is the terminal result for newly created contacts.
-- Do not relax the base result enum/check or allow invalid/duplicate rows to become ready.

alter table public.contact_import_rows
  drop constraint if exists contact_import_rows_included_result_check;

alter table public.contact_import_rows
  add constraint contact_import_rows_included_result_check
  check (not included or result in ('VALID', 'MATCHED_EXISTING', 'CREATED'));

alter table public.contact_import_rows
  drop constraint if exists contact_import_rows_ready_check;

alter table public.contact_import_rows
  add constraint contact_import_rows_ready_check
  check (
    not row_is_ready
    or (
      included
      and result in ('VALID', 'MATCHED_EXISTING', 'CREATED')
      and gender_review_status = 'REVIEWED'
      and gender_final is not null
    )
  );
