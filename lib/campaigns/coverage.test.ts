import { describe, expect, it } from 'vitest'
import { findCoverageIssues } from './coverage'

describe('campaign gender coverage', () => {
  const steps = (neutralText = '') => [{ type: 'TEXT' as const, neutralText, maleText: 'Hombre', femaleText: 'Mujer' }]

  it('accepts male and female content without neutral when the audience has both genders', () => {
    expect(findCoverageIssues([{ key: 'A', steps: steps() }], { MALE: 25, FEMALE: 25, UNKNOWN: 0 })).toEqual([])
  })

  it('requires neutral content for unknown-gender recipients', () => {
    expect(findCoverageIssues([{ key: 'A', steps: steps() }], { MALE: 25, FEMALE: 24, UNKNOWN: 1 })).toEqual([{ variantKey: 'A', stepIndex: 0, field: 'neutralText', gender: 'UNKNOWN' }])
  })

  it('requires the specific gender field when no neutral fallback exists', () => {
    expect(findCoverageIssues([{ key: 'A', steps: [{ type: 'TEXT', neutralText: '', maleText: '', femaleText: 'Mujer' }] }], { MALE: 1, FEMALE: 1, UNKNOWN: 0 })).toEqual([{ variantKey: 'A', stepIndex: 0, field: 'maleText', gender: 'MALE' }])
  })
})
