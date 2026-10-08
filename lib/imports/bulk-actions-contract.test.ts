import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261008100000_review_workspace_gender_labels.sql'), 'utf8')

describe('bulk review and labels transport contract', () => {
  it('uses one set-based operation for selected review rows', () => {
    expect(migration).toContain('r.id = any(p_row_ids)')
    expect(migration).toContain('get diagnostics v_count = row_count')
    expect(migration).not.toMatch(/for\s+.*\s+in\s+p_row_ids/iu)
  })

  it('assigns labels from a contact id set with owner-scoped joins', () => {
    expect(migration).toContain('select v_owner_id, c.id, p_label_id from public.contacts c')
    expect(migration).toContain('c.owner_id = v_owner_id and c.id = any(p_contact_ids)')
    expect(migration).toContain('on conflict do nothing')
    expect(migration).toContain('delete from public.contact_labels')
  })
})
