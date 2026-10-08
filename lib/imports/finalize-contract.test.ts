import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261008140000_allow_created_terminal_results.sql'), 'utf8')
const reviewMigration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261008100000_review_workspace_gender_labels.sql'), 'utf8')
const terminalResults = new Set(['VALID', 'MATCHED_EXISTING', 'CREATED'])

function satisfiesFinalizeChecks(row: { included: boolean; ready: boolean; result: string; genderStatus: string; genderFinal: string | null }) {
  const includedCheck = !row.included || terminalResults.has(row.result)
  const readyCheck = !row.ready || (row.included && terminalResults.has(row.result) && row.genderStatus === 'REVIEWED' && row.genderFinal !== null)
  return includedCheck && readyCheck
}

describe('finalize terminal result contract', () => {
  it('allows VALID to transition to CREATED while preserving ready requirements', () => {
    expect(migration).toContain("result in ('VALID', 'MATCHED_EXISTING', 'CREATED')")
    expect(migration).toContain("gender_review_status = 'REVIEWED'")
    expect(migration).toContain('gender_final is not null')
    expect(reviewMigration).toContain("set contact_id = i.id, result = 'CREATED'")
  })

  it('keeps invalid and duplicate included rows invalid', () => {
    expect(migration).not.toContain("result in ('VALID', 'MATCHED_EXISTING', 'CREATED', 'INVALID_PHONE')")
    expect(migration).not.toContain("result in ('VALID', 'MATCHED_EXISTING', 'CREATED', 'DUPLICATE_IN_FILE')")
    expect(reviewMigration).toContain("r.result not in ('VALID', 'MATCHED_EXISTING') or not r.row_is_ready")
  })

  it('retains mixed finalization counts and idempotent completion behavior', () => {
    expect(reviewMigration).toContain("into v_created from updated")
    expect(reviewMigration).toContain("result = 'MATCHED_EXISTING' and contact_id is not null")
    expect(reviewMigration).toContain("if v_status = 'COMPLETED' then")
    expect(reviewMigration).toContain("result in ('CREATED', 'MATCHED_EXISTING')")
    expect(reviewMigration).toContain("set status = 'COMPLETED'")
  })

  it('covers the regression matrix without allowing invalid or duplicate rows', () => {
    const ready = { included: true, ready: true, genderStatus: 'REVIEWED', genderFinal: 'MALE' }
    expect(satisfiesFinalizeChecks({ ...ready, result: 'VALID' })).toBe(true)
    expect(satisfiesFinalizeChecks({ ...ready, result: 'CREATED' })).toBe(true)
    expect(satisfiesFinalizeChecks({ ...ready, result: 'MATCHED_EXISTING' })).toBe(true)
    expect(satisfiesFinalizeChecks({ ...ready, result: 'INVALID_PHONE' })).toBe(false)
    expect(satisfiesFinalizeChecks({ ...ready, result: 'DUPLICATE_IN_FILE' })).toBe(false)
    expect(satisfiesFinalizeChecks({ ...ready, result: 'VALID', genderFinal: null })).toBe(false)

    const mixed = ['CREATED', 'CREATED', 'MATCHED_EXISTING']
    expect(mixed.filter((result) => result === 'CREATED')).toHaveLength(2)
    expect(mixed.filter((result) => result === 'MATCHED_EXISTING')).toHaveLength(1)
    expect(mixed.filter((result) => terminalResults.has(result))).toHaveLength(3)
  })
})
