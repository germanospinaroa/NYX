import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('bulk finalize database contract', () => {
  it('uses an invoker RPC with set-based SQL and no row loop', () => {
    const sql = [
      readFileSync('supabase/migrations/20261007190000_bulk_finalize_contact_import.sql', 'utf8'),
      readFileSync('supabase/migrations/20261008100000_review_workspace_gender_labels.sql', 'utf8'),
    ].join('\n')
    expect(sql).toMatch(/security invoker/i)
    expect(sql).toMatch(/insert\s+into\s+public\.contacts[\s\S]*select[\s\S]*on conflict/i)
    expect(sql).toMatch(/update\s+public\.contact_import_rows[\s\S]*from\s+public\.contacts/i)
    expect(sql).not.toMatch(/for\s+row/i)
    expect(sql).toMatch(/grant execute[\s\S]*authenticated/i)
  })
})
