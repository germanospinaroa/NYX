import { describe, expect, it } from 'vitest'
import { assignContentVariants, validateContentVariants, resolveMessageVariant } from './variants'

describe('campaign message variants', () => {
  const messages = { neutral: 'Hola', male: 'Hola él', female: 'Hola ella' }
  it('uses gender variants and neutral fallback', () => {
    expect(resolveMessageVariant('MALE', messages).variant).toBe('MALE')
    expect(resolveMessageVariant('FEMALE', messages).variant).toBe('FEMALE')
    expect(resolveMessageVariant('UNKNOWN', messages)).toEqual({ variant: 'NEUTRAL', text: 'Hola' })
  })
  it('does not claim delivered/read from provider acceptance', () => {
    expect(resolveMessageVariant('MALE', { neutral: 'Hola' }).text).toBe('Hola')
  })

  it('assigns three variants deterministically and with a maximum difference of one', () => {
    const contacts = Array.from({ length: 31 }, (_, index) => `contact-${index}`)
    const first = assignContentVariants('campaign-1', contacts, ['A', 'B', 'C'])
    const second = assignContentVariants('campaign-1', contacts, ['A', 'B', 'C'])
    expect(first).toEqual(second)
    const counts = Object.values(first).reduce<Record<string, number>>((result, key) => ({ ...result, [key]: (result[key] ?? 0) + 1 }), {})
    expect(Math.max(...Object.values(counts)) - Math.min(...Object.values(counts))).toBeLessThanOrEqual(1)
  })

  it('keeps an even 30-recipient distribution across three variants', () => {
    const contacts = Array.from({ length: 30 }, (_, index) => `contact-${index}`)
    const assignment = assignContentVariants('campaign-2', contacts, ['A', 'B', 'C'])
    expect(Object.values(assignment).filter((key) => key === 'A')).toHaveLength(10)
    expect(Object.values(assignment).filter((key) => key === 'B')).toHaveLength(10)
    expect(Object.values(assignment).filter((key) => key === 'C')).toHaveLength(10)
  })

  it('rejects variants with different step shapes', () => {
    expect(() => validateContentVariants([
      { key: 'A', steps: [{ type: 'TEXT' }] },
      { key: 'B', steps: [{ type: 'IMAGE' }] },
    ])).toThrow('VARIANT_STEP_TYPE_MISMATCH')
  })

  it('accepts one to five variants and rejects a sixth', () => {
    const steps = [{ type: 'TEXT' as const }]
    expect(validateContentVariants([{ key: 'A', steps }])).toBe(true)
    expect(() => validateContentVariants(['A', 'B', 'C', 'D', 'E', 'F'].map((key) => ({ key, steps })))).toThrow('INVALID_VARIANT_COUNT')
  })
})
