import { describe, expect, it } from 'vitest'
import { autoDetectMapping, validateMapping } from './mapping'

describe('column mapping', () => {
  it('detects Spanish headers', () => {
    expect(autoDetectMapping(['Nombre completo', 'Teléfono móvil'])).toEqual({
      name: 'Nombre completo',
      phone: 'Teléfono móvil',
    })
  })

  it('detects English headers case-insensitively', () => {
    expect(autoDetectMapping(['FULL NAME', 'Mobile'])).toEqual({
      name: 'FULL NAME',
      phone: 'Mobile',
    })
  })

  it('detects optional gender review columns without requiring them', () => {
    expect(autoDetectMapping(['Name', 'Phone', 'Gender Suggestion', 'Gender Confidence', 'Gender Review'])).toEqual({
      name: 'Name', phone: 'Phone', genderSuggestion: 'Gender Suggestion',
      genderConfidence: 'Gender Confidence', genderReview: 'Gender Review',
    })
  })

  it('requires two different existing columns for manual mapping', () => {
    expect(validateMapping(['Name', 'Phone'], { name: 'Name', phone: 'Phone' })).toBe(true)
    expect(validateMapping(['Name'], { name: 'Name', phone: 'Phone' })).toBe(false)
    expect(validateMapping(['Name', 'Phone'], { name: 'Name', phone: 'Name' })).toBe(false)
  })
})
