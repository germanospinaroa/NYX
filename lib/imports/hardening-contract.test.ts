import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261008120000_harden_rpc_grants_and_rls.sql'),
  'utf8',
)

const rpcSignatures = [
  'bulk_review_contact_import_rows(uuid, uuid[], text)',
  'bulk_set_contact_label(uuid, uuid[], text)',
  'bulk_update_contact_gender(uuid[], text)',
  'finalize_contact_import(uuid)',
  'get_contact_import_review(uuid, integer, integer, text, text)',
  'refresh_contact_import_status(uuid)',
  'resolve_contact_import_existing(uuid)',
  'update_contact_import_row(uuid, uuid, text, text, text, text, text, text, text, boolean)',
]

describe('Supabase hardening migration', () => {
  it('removes public and anon RPC execution and grants authenticated only', () => {
    for (const signature of rpcSignatures) {
      expect(migration).toContain(`revoke execute on function public.${signature} from public;`)
      expect(migration).toContain(`revoke execute on function public.${signature} from anon;`)
      expect(migration).toContain(`grant execute on function public.${signature} to authenticated;`)
    }
  })

  it('recreates application policies for authenticated users with ownership checks', () => {
    expect(migration).toMatch(/drop policy if exists "contacts_select_own"/iu)
    expect(migration).toMatch(/create policy "contacts_select_own" on public\.contacts for select to authenticated/iu)
    expect(migration).toMatch(/create policy "contacts_update_own" on public\.contacts for update to authenticated[\s\S]*using[\s\S]*with check/iu)
    expect(migration).toMatch(/create policy "import_rows_insert_own" on public\.contact_import_rows for insert to authenticated[\s\S]*with check/iu)
    expect(migration).toMatch(/create policy "labels_update_own" on public\.labels for update to authenticated[\s\S]*using[\s\S]*with check/iu)
  })
})
