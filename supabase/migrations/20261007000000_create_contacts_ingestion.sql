-- NYX Phase 1: contacts and import traceability.
-- This migration is intentionally forward-only; future changes use new migrations.

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  first_name text not null,
  phone_e164 text not null,
  phone_country text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contacts_owner_phone_unique unique (owner_id, phone_e164),
  constraint contacts_id_owner_unique unique (id, owner_id),
  constraint contacts_phone_e164_format check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$')
);

create table public.contact_imports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  original_filename text not null,
  source_format text not null check (source_format in ('CSV', 'XLSX')),
  status text not null default 'PENDING' check (status in ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  total_rows integer not null default 0 check (total_rows >= 0),
  valid_rows integer not null default 0 check (valid_rows >= 0),
  created_contacts integer not null default 0 check (created_contacts >= 0),
  matched_existing_contacts integer not null default 0 check (matched_existing_contacts >= 0),
  duplicate_rows integer not null default 0 check (duplicate_rows >= 0),
  invalid_rows integer not null default 0 check (invalid_rows >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint contact_imports_id_owner_unique unique (id, owner_id)
);

create table public.contact_import_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  row_number integer not null check (row_number > 1),
  raw_name text not null default '',
  raw_phone text not null default '',
  normalized_name text,
  phone_e164 text,
  result text not null check (result in ('VALID', 'CREATED', 'MATCHED_EXISTING', 'DUPLICATE_IN_FILE', 'INVALID_NAME', 'INVALID_PHONE')),
  error_code text,
  contact_id uuid,
  created_at timestamptz not null default now(),
  constraint import_rows_import_owner_fk foreign key (import_id, owner_id)
    references public.contact_imports(id, owner_id) on delete cascade,
  constraint import_rows_contact_owner_fk foreign key (contact_id, owner_id)
    references public.contacts(id, owner_id) on delete restrict
);

create index contacts_owner_id_idx on public.contacts (owner_id);
create index contact_imports_owner_created_idx on public.contact_imports (owner_id, created_at desc);
create index contact_import_rows_import_id_idx on public.contact_import_rows (import_id);
create index contact_import_rows_contact_id_idx on public.contact_import_rows (contact_id) where contact_id is not null;

alter table public.contacts enable row level security;
alter table public.contact_imports enable row level security;
alter table public.contact_import_rows enable row level security;

create policy "contacts_select_own" on public.contacts for select
  using ((select auth.uid()) = owner_id);
create policy "contacts_insert_own" on public.contacts for insert
  with check ((select auth.uid()) = owner_id);
create policy "contacts_update_own" on public.contacts for update
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "imports_select_own" on public.contact_imports for select
  using ((select auth.uid()) = owner_id);
create policy "imports_insert_own" on public.contact_imports for insert
  with check ((select auth.uid()) = owner_id);
create policy "imports_update_own" on public.contact_imports for update
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "import_rows_select_own" on public.contact_import_rows for select
  using ((select auth.uid()) = owner_id);
create policy "import_rows_insert_own" on public.contact_import_rows for insert
  with check ((select auth.uid()) = owner_id);
create policy "import_rows_update_own" on public.contact_import_rows for update
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
