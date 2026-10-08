import { describe, expect, it } from 'vitest'
import { resolveMessageVariant } from './variants'

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
})
