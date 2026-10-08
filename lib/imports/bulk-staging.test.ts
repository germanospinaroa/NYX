import { describe, expect, it } from 'vitest'
import { stageRowsInBatches, type StagingRow } from './persistence'

describe('bulk staging transport budget', () => {
  it('stages 5,000 rows in batches instead of one remote call per row', async () => {
    const rows: StagingRow[] = Array.from({ length: 5000 }, (_, index) => ({
      owner_id: 'owner-id',
      import_id: 'import-id',
      row_number: index + 2,
      raw_name: `Person ${index}`,
      raw_phone: `300${String(index).padStart(7, '0')}`,
      normalized_name: `Person ${index}`,
      phone_e164: `+57300${String(index).padStart(7, '0')}`,
      result: 'VALID',
      error_code: null,
      gender_suggestion: null,
      gender_confidence: null,
      gender_final: 'UNKNOWN',
      gender_review_status: 'REVIEWED',
      included: true,
      row_is_ready: true,
    }))
    const batches: StagingRow[][] = []
    const metrics = await stageRowsInBatches(rows, async (batch) => { batches.push(batch) })

    expect(metrics.rowsStaged).toBe(5000)
    expect(metrics.batches).toBe(batches.length)
    expect(metrics.remoteRequests).toBeLessThanOrEqual(10)
    expect(metrics.remoteRequests).toBeLessThan(5000)
    expect(metrics.bytesSent).toBeGreaterThan(0)
    expect(batches.flat()).toHaveLength(5000)
  })
})
