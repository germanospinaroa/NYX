import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261008100000_review_workspace_gender_labels.sql'), 'utf8')

describe('review workspace database contract', () => {
  it('has gender review fields and review actions', () => {
    expect(migration).toContain('add column if not exists gender_suggestion text')
    expect(migration).toContain('add column if not exists gender_confidence text')
    expect(migration).toContain('add column if not exists gender_final text')
    expect(migration).toContain("add column if not exists gender_review_status text not null default 'PENDING'")
    expect(migration).toContain('bulk_review_contact_import_rows')
    expect(migration).toContain('resolve_contact_import_existing')
    expect(migration).toContain('get_contact_import_review')
    expect(migration).toContain('security invoker')
  })

  it('requires reviewed final gender before set-based finalization', () => {
    expect(migration).toContain("not r.row_is_ready")
    expect(migration).toContain("r.gender_review_status = 'REVIEWED'")
    expect(migration).toContain("set status = 'FINALIZING'")
    expect(migration).toContain('insert into public.contacts')
    expect(migration).toContain('on conflict (owner_id, phone_e164) do nothing')
    expect(migration).toContain("and r.result in ('VALID', 'MATCHED_EXISTING')")
    expect(migration).not.toMatch(/for\s+row/iu)
  })

  it('defines owner-scoped many-to-many labels and bulk actions', () => {
    expect(migration).toContain('create table if not exists public.labels')
    expect(migration).toContain('create table if not exists public.contact_labels')
    expect(migration).toContain('contact_labels_contact_owner_fk')
    expect(migration).toContain('contact_labels_label_owner_fk')
    expect(migration).toContain('bulk_set_contact_label')
    expect(migration).toContain('bulk_update_contact_gender')
    expect(migration).toContain('grant execute on function public.bulk_set_contact_label')
  })
})
