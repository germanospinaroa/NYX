import { describe, expect, it } from 'vitest'
import { ImportOutcomeUnknownError, SupabaseTimeoutError, persistPreparedImport, stageRowsInBatches, toStagingRow, withTimeout } from './persistence'
import type { ImportPreparation } from './process'
import { prepareImport } from './process'

function fakeSupabase() {
  const calls: Array<{ operation: string; table?: string; count?: number }> = []
  const client = {
    from(table: string) {
      return {
        select() {
          const query = { eq: () => query, maybeSingle: async () => ({ data: null, error: null }) }
          return query
        },
        insert(payload: unknown[]) {
          calls.push({ operation: 'insert', table, count: payload.length })
          return { select: () => ({ single: async () => ({ data: { id: 'import-id' }, error: null }) }) }
        },
        upsert: async (payload: unknown[]) => { calls.push({ operation: 'upsert', table, count: payload.length }); return { error: null } },
        update(values: unknown) {
          calls.push({ operation: 'update', table, count: Object.keys(values as object).length })
          const query = { eq: () => query, then: (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve) }
          return query
        },
      }
    },
    rpc(name: string) {
      calls.push({ operation: `rpc:${name}` })
      return { single: async () => ({ data: { created_contacts: 5000, matched_existing_contacts: 0, processed_rows: 5000 }, error: null }) }
    },
  }
  return { client, calls }
}

describe('persistPreparedImport bulk transport', () => {
  it('marks PRECLASSIFIED rows ready while REVIEW rows remain pending', () => {
    const preclassified = prepareImport(
      [{ Name: 'Synthetic', Phone: '+442079460007', Suggestion: 'MALE', Review: 'PRECLASSIFIED' }],
      { name: 'Name', phone: 'Phone', genderSuggestion: 'Suggestion', genderReview: 'Review' }, new Set(), 'CO',
    ).rows[0]
    const review = prepareImport(
      [{ Name: 'Synthetic', Phone: '+442079460008', Suggestion: 'MALE', Review: 'REVIEW' }],
      { name: 'Name', phone: 'Phone', genderSuggestion: 'Suggestion', genderReview: 'Review' }, new Set(), 'CO',
    ).rows[0]

    expect(toStagingRow('owner-id', 'import-id', preclassified)).toMatchObject({ gender_final: 'MALE', gender_review_status: 'REVIEWED', row_is_ready: true })
    expect(toStagingRow('owner-id', 'import-id', review)).toMatchObject({ gender_final: null, gender_review_status: 'PENDING', row_is_ready: false })
  })

  it('classifies an ambiguous import creation timeout without inventing an import id', async () => {
    const client = {
      from(table: string) {
        if (table === 'contact_imports') {
          return {
            select() {
              const query = { eq: () => query, maybeSingle: async () => ({ data: null, error: null }) }
              return query
            },
            insert() {
              return { select: () => ({ single: async () => { throw new SupabaseTimeoutError() } }) }
            },
          }
        }
        throw new Error(`unexpected table: ${table}`)
      },
    }
    await expect(persistPreparedImport(
      client as never,
      'owner-id',
      'contacts.csv',
      'CSV',
      { rows: [], summary: { total: 0, valid: 0, invalid: 0, duplicateInFile: 0, matchedExisting: 0 } },
      '00000000-0000-4000-8000-000000000003',
    )).rejects.toMatchObject({ name: 'ImportOutcomeUnknownError', importId: null })
  })

  it('reopens a failed import before retrying the same idempotency key', async () => {
    const updates: Array<Record<string, unknown>> = []
    const client = {
      from(table: string) {
        if (table === 'contact_imports') {
          return {
            select() {
              const query = { eq: () => query, maybeSingle: async () => ({ data: { id: 'failed-import', status: 'FAILED', staging_complete: false, created_contacts: 0, matched_existing_contacts: 0 }, error: null }) }
              return query
            },
            update(values: Record<string, unknown>) {
              updates.push(values)
              const query = { eq: () => query, then: (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve) }
              return query
            },
          }
        }
        if (table === 'contact_import_rows') return { upsert: async () => ({ error: null }) }
        throw new Error(`unexpected table: ${table}`)
      },
      rpc() {
        return { single: async () => ({ data: { created_contacts: 0, matched_existing_contacts: 0, processed_rows: 0 }, error: null }) }
      },
    }
    const result = await persistPreparedImport(
      client as never,
      'owner-id',
      'contacts.csv',
      'CSV',
      { rows: [], summary: { total: 0, valid: 0, invalid: 0, duplicateInFile: 0, matchedExisting: 0 } },
      '00000000-0000-4000-8000-000000000004',
    )
    expect(result.importId).toBe('failed-import')
    expect(updates[0]).toEqual({ status: 'STAGING', staging_complete: false })
  })

  it('classifies a slow remote operation as a timeout', async () => {
    await expect(withTimeout(new Promise((resolve) => setTimeout(resolve, 20)), 1)).rejects.toBeInstanceOf(SupabaseTimeoutError)
    expect(new ImportOutcomeUnknownError('import-id')).toMatchObject({ message: 'IMPORT_OUTCOME_UNKNOWN' })
  })

  it('does not make a remote call for empty staging', async () => {
    const metrics = await stageRowsInBatches([], async () => undefined)
    expect(metrics).toMatchObject({ rowsStaged: 0, batches: 0, remoteRequests: 0 })
  })

  it('does not issue per-row Supabase operations for 5,000 rows', async () => {
    const rows = Array.from({ length: 5000 }, (_, index) => ({
      rowNumber: index + 2,
      rawName: `Person ${index}`,
      rawPhone: `300${String(index).padStart(7, '0')}`,
      normalizedName: `Person ${index}`,
      firstName: 'Person',
      phoneE164: `+57300${String(index).padStart(7, '0')}`,
      phoneCountry: 'CO',
      genderSuggestion: null,
      genderConfidence: null,
      genderFinal: 'UNKNOWN' as const,
      genderReviewStatus: 'REVIEWED' as const,
      result: 'VALID' as const,
    }))
    const preparation: ImportPreparation = {
      rows,
      summary: { total: 5000, valid: 5000, invalid: 0, duplicateInFile: 0, matchedExisting: 0 },
    }
    const { client, calls } = fakeSupabase()
    const result = await persistPreparedImport(client as never, 'owner-id', 'contacts.csv', 'CSV', preparation, '00000000-0000-4000-8000-000000000001')

    expect(result.stagedRows).toBe(5000)
    expect(calls.filter((call) => call.operation === 'insert' && call.table === 'contact_imports')).toHaveLength(1)
    expect(calls.filter((call) => call.operation === 'upsert' && call.table === 'contact_import_rows').length).toBeLessThanOrEqual(8)
    expect(calls.filter((call) => call.operation.startsWith('rpc:'))).toHaveLength(2)
    expect(calls.some((call) => call.table === 'contacts')).toBe(false)
    expect(calls.filter((call) => call.operation === 'update' && call.table === 'contact_import_rows')).toHaveLength(0)
    // One lookup, one import row, seven staging batches, one state update and
    // one finalize RPC: bounded control-plane I/O, never one call per row.
    expect(result.metrics.remoteRequests).toBeLessThanOrEqual(12)
  })

  it('reuses a completed import idempotency key without restaging', async () => {
    const calls: string[] = []
    const client = {
      from(table: string) {
        return {
          select() {
            const query = { eq: () => query, maybeSingle: async () => ({ data: { id: 'existing-import', status: 'COMPLETED', staging_complete: true, created_contacts: 4, matched_existing_contacts: 2 }, error: null }) }
            return query
          },
          insert() { calls.push(`insert:${table}`); throw new Error('should not insert') },
        }
      },
    }
    const result = await persistPreparedImport(client as never, 'owner-id', 'contacts.csv', 'CSV', { rows: [], summary: { total: 0, valid: 0, invalid: 0, duplicateInFile: 0, matchedExisting: 0 } }, '00000000-0000-4000-8000-000000000002')
    expect(result.importId).toBe('existing-import')
    expect(result.stagedRows).toBe(0)
    expect(calls).toEqual([])
  })
})
