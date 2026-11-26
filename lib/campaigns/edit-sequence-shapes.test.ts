import { describe, expect, it } from 'vitest'
import { validateContentVariants } from './variants'
import { findCoverageIssues } from './coverage'

describe('editable campaign sequence shapes', () => {
  it.each([1, 2, 3, 4, 5])('accepts one variant with %s gender-covered text steps', (stepCount) => {
    const steps = Array.from({ length: stepCount }, () => ({ type: 'TEXT' as const, neutralText: '', maleText: 'Mensaje hombre', femaleText: 'Mensaje mujer' }))
    expect(validateContentVariants([{ key: 'A', steps }])).toBe(true)
    expect(findCoverageIssues([{ key: 'A', steps }], { MALE: 10, FEMALE: 59, UNKNOWN: 0 })).toEqual([])
  })
})
