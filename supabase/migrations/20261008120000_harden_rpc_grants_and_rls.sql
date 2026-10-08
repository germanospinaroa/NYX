-- NYX security hardening. Forward-only; do not edit after applying.
-- Restrict application RPC execution to authenticated users and narrow
-- application RLS policies from public to authenticated.

revoke execute on function public.bulk_review_contact_import_rows(uuid, uuid[], text) from public;
revoke execute on function public.bulk_review_contact_import_rows(uuid, uuid[], text) from anon;
grant execute on function public.bulk_review_contact_import_rows(uuid, uuid[], text) to authenticated;

revoke execute on function public.bulk_set_contact_label(uuid, uuid[], text) from public;
revoke execute on function public.bulk_set_contact_label(uuid, uuid[], text) from anon;
grant execute on function public.bulk_set_contact_label(uuid, uuid[], text) to authenticated;

revoke execute on function public.bulk_update_contact_gender(uuid[], text) from public;
revoke execute on function public.bulk_update_contact_gender(uuid[], text) from anon;
grant execute on function public.bulk_update_contact_gender(uuid[], text) to authenticated;

revoke execute on function public.finalize_contact_import(uuid) from public;
revoke execute on function public.finalize_contact_import(uuid) from anon;
grant execute on function public.finalize_contact_import(uuid) to authenticated;

revoke execute on function public.get_contact_import_review(uuid, integer, integer, text, text) from public;
revoke execute on function public.get_contact_import_review(uuid, integer, integer, text, text) from anon;
grant execute on function public.get_contact_import_review(uuid, integer, integer, text, text) to authenticated;

revoke execute on function public.refresh_contact_import_status(uuid) from public;
revoke execute on function public.refresh_contact_import_status(uuid) from anon;
grant execute on function public.refresh_contact_import_status(uuid) to authenticated;

revoke execute on function public.resolve_contact_import_existing(uuid) from public;
revoke execute on function public.resolve_contact_import_existing(uuid) from anon;
grant execute on function public.resolve_contact_import_existing(uuid) to authenticated;

revoke execute on function public.update_contact_import_row(uuid, uuid, text, text, text, text, text, text, text, boolean) from public;
revoke execute on function public.update_contact_import_row(uuid, uuid, text, text, text, text, text, text, text, boolean) from anon;
grant execute on function public.update_contact_import_row(uuid, uuid, text, text, text, text, text, text, text, boolean) to authenticated;

drop policy if exists "contacts_select_own" on public.contacts;
drop policy if exists "contacts_insert_own" on public.contacts;
drop policy if exists "contacts_update_own" on public.contacts;
create policy "contacts_select_own" on public.contacts for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy "contacts_insert_own" on public.contacts for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy "contacts_update_own" on public.contacts for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "imports_select_own" on public.contact_imports;
drop policy if exists "imports_insert_own" on public.contact_imports;
drop policy if exists "imports_update_own" on public.contact_imports;
create policy "imports_select_own" on public.contact_imports for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy "imports_insert_own" on public.contact_imports for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy "imports_update_own" on public.contact_imports for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "import_rows_select_own" on public.contact_import_rows;
drop policy if exists "import_rows_insert_own" on public.contact_import_rows;
drop policy if exists "import_rows_update_own" on public.contact_import_rows;
create policy "import_rows_select_own" on public.contact_import_rows for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy "import_rows_insert_own" on public.contact_import_rows for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy "import_rows_update_own" on public.contact_import_rows for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "labels_select_own" on public.labels;
drop policy if exists "labels_insert_own" on public.labels;
drop policy if exists "labels_update_own" on public.labels;
drop policy if exists "labels_delete_own" on public.labels;
create policy "labels_select_own" on public.labels for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy "labels_insert_own" on public.labels for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy "labels_update_own" on public.labels for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy "labels_delete_own" on public.labels for delete to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "contact_labels_select_own" on public.contact_labels;
drop policy if exists "contact_labels_insert_own" on public.contact_labels;
drop policy if exists "contact_labels_delete_own" on public.contact_labels;
create policy "contact_labels_select_own" on public.contact_labels for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy "contact_labels_insert_own" on public.contact_labels for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy "contact_labels_delete_own" on public.contact_labels for delete to authenticated
  using ((select auth.uid()) = owner_id);
