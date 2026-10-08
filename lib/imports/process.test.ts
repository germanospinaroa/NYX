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

  it('keeps suggestions separate from final gender and supports explicit unknown review', () => {
    const result = prepareImport(
      [{ Name: 'Synthetic A', Phone: '+442079460001', 'Gender Suggestion': 'FEMALE', 'Gender Confidence': 'HIGH' },
       { Name: 'Synthetic B', Phone: '+442079460002', 'Gender Suggestion': 'MALE', 'Gender Review': 'REVIEWED' }],
      { name: 'Name', phone: 'Phone', genderSuggestion: 'Gender Suggestion', genderConfidence: 'Gender Confidence', genderReview: 'Gender Review' },
      new Set(), 'CO',
    )
    expect(result.rows[0]).toMatchObject({ genderSuggestion: 'FEMALE', genderConfidence: 'HIGH', genderFinal: null, genderReviewStatus: 'PENDING' })
    expect(result.rows[1]).toMatchObject({ genderSuggestion: 'MALE', genderFinal: null, genderReviewStatus: 'PENDING' })
  })

  it('defaults files without gender columns to UNKNOWN pending explicit review', () => {
    const result = prepareImport([{ Name: 'Synthetic A', Phone: '+442079460001' }], { name: 'Name', phone: 'Phone' }, new Set(), 'CO')
    expect(result.rows[0]).toMatchObject({ genderSuggestion: null, genderFinal: 'UNKNOWN', genderReviewStatus: 'PENDING' })
  })

  it('keeps MALE and FEMALE suggestions pending until explicit action', () => {
    const result = prepareImport([
      { Name: 'Synthetic A', Phone: '+442079460001', Gender: 'MALE' },
      { Name: 'Synthetic B', Phone: '+442079460002', Gender: 'FEMALE' },
    ], { name: 'Name', phone: 'Phone', genderSuggestion: 'Gender' }, new Set(), 'CO')
    expect(result.rows.map((row) => [row.genderSuggestion, row.genderFinal, row.genderReviewStatus])).toEqual([
      ['MALE', null, 'PENDING'], ['FEMALE', null, 'PENDING'],
    ])
  })

  it('promotes only explicit PRECLASSIFIED suggestions to reviewed final gender', () => {
    const result = prepareImport([
      { Name: 'Synthetic Male', Phone: '+442079460003', 'Gender Suggestion': 'MALE', 'Gender Confidence': 'HIGH', 'Gender Review': 'PRECLASSIFIED' },
      { Name: 'Synthetic Female', Phone: '+442079460004', 'Gender Suggestion': 'FEMALE', 'Gender Confidence': 'MEDIUM', 'Gender Review': 'PRECLASSIFIED' },
    ], { name: 'Name', phone: 'Phone', genderSuggestion: 'Gender Suggestion', genderConfidence: 'Gender Confidence', genderReview: 'Gender Review' }, new Set(), 'CO')

    expect(result.rows.map((row) => [row.genderSuggestion, row.genderFinal, row.genderReviewStatus])).toEqual([
      ['MALE', 'MALE', 'REVIEWED'], ['FEMALE', 'FEMALE', 'REVIEWED'],
    ])
  })

  it('keeps REVIEW and external review markers pending', () => {
    const result = prepareImport([
      { Name: 'Synthetic Review', Phone: '+442079460005', 'Gender Suggestion': 'MALE', 'Gender Review': 'REVIEW' },
      { Name: 'Synthetic External', Phone: '+442079460006', 'Gender Suggestion': 'FEMALE', 'Gender Review': 'REVIEWED' },
    ], { name: 'Name', phone: 'Phone', genderSuggestion: 'Gender Suggestion', genderReview: 'Gender Review' }, new Set(), 'CO')

    expect(result.rows.map((row) => [row.genderFinal, row.genderReviewStatus])).toEqual([
      [null, 'PENDING'], [null, 'PENDING'],
    ])
  })
})
