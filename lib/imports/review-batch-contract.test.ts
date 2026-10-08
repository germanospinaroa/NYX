import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261008130000_bulk_update_contact_import_rows.sql'), 'utf8')
const route = readFileSync(resolve(process.cwd(), 'app/api/import/[id]/review/route.ts'), 'utf8')

describe('review batch save contract', () => {
  it('uses one set-based RPC and does not loop over rows in SQL', () => {
    expect(migration).toContain('bulk_update_contact_import_rows')
    expect(migration).toContain('jsonb_to_recordset')
    expect(migration).toContain('raw_changes')
    expect(migration).toContain("c.phone_e164 !~ '^\\+[1-9][0-9]{7,14}$'")
    expect(migration).not.toContain('c.name_valid')
    expect(migration).not.toContain('c.phone_valid')
    expect(migration).toContain('update public.contact_import_rows')
    expect(migration).not.toMatch(/for\s+.*\s+in\s+p_changes/iu)
    expect(migration).toContain('grant execute on function public.bulk_update_contact_import_rows(uuid, jsonb) to authenticated;')
  })

  it('routes multiple drafts through one batch endpoint', () => {
    expect(route).toContain("export async function PATCH")
    expect(route).toContain("supabase.rpc('bulk_update_contact_import_rows'")
    expect(route).not.toContain("fetch('/api/import/${importId}/review/row")
  })
})
