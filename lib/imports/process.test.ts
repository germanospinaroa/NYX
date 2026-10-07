import { describe, expect, it } from 'vitest'
import { prepareImport } from './process'

describe('prepareImport', () => {
  it('counts valid rows, duplicate rows, and existing contacts', () => {
    const result = prepareImport(
      [
        { Name: 'Ana', Phone: '3001234567' },
        { Name: 'Ana duplicada', Phone: '3001234567' },
        { Name: 'Existing', Phone: '3100000000' },
        { Name: '', Phone: '3200000000' },
        { Name: 'Bad phone', Phone: '123' },
      ],
      { name: 'Name', phone: 'Phone' },
      new Set(['+573100000000']),
      'CO',
    )

    expect(result.summary).toEqual({
      total: 5,
      valid: 2,
      invalid: 2,
      duplicateInFile: 1,
      matchedExisting: 1,
    })
    expect(result.rows.map((row) => row.result)).toEqual([
      'VALID',
      'DUPLICATE_IN_FILE',
      'MATCHED_EXISTING',
      'INVALID_NAME',
      'INVALID_PHONE',
    ])
  })
})
