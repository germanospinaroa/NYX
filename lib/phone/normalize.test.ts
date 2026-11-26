import { describe, expect, it } from 'vitest'
import { normalizePhone } from './normalize'

describe('normalizePhone', () => {
  it('normalizes a Colombian local number using the configured region', () => {
    expect(normalizePhone('300 123 4567', 'CO')).toMatchObject({
      e164: '+573001234567',
      country: 'CO',
    })
  })

  it('accepts international formatting and 00 prefix', () => {
    const plus = normalizePhone('+57 (300) 123-4567', 'CO')
    const zero = normalizePhone('0057 300 123 4567', 'CO')
    expect('e164' in plus && plus.e164).toBe('+573001234567')
    expect('e164' in zero && zero.e164).toBe('+573001234567')
  })

  it('rejects empty and invalid numbers without inventing a value', () => {
    expect(normalizePhone('', 'CO')).toMatchObject({ errorCode: 'INVALID_PHONE' })
    expect(normalizePhone('123', 'CO')).toMatchObject({ errorCode: 'INVALID_PHONE' })
    expect(normalizePhone('not a phone', 'CO')).toMatchObject({ errorCode: 'INVALID_PHONE' })
  })

  it('accepts a structurally possible Costa Rican E.164 number', () => {
    expect(normalizePhone('+50671091533', 'CO')).toMatchObject({ e164: '+50671091533', country: 'CR' })
  })

  it('accepts international numbers outside the default region', () => {
    expect(normalizePhone('+14155552671', 'CO')).toMatchObject({ e164: '+14155552671', country: 'US' })
    expect(normalizePhone('+442079460018', 'CO')).toMatchObject({ e164: '+442079460018', country: 'GB' })
  })

  it('rejects incomplete, overlong, extension-bearing and malformed numbers', () => {
    expect(normalizePhone('+5067109153', 'CO')).toMatchObject({ errorCode: 'INVALID_PHONE' })
    expect(normalizePhone('+50671091533 ext 4', 'CO')).toMatchObject({ errorCode: 'INVALID_PHONE' })
    expect(normalizePhone('+99912345678', 'CO')).toMatchObject({ errorCode: 'INVALID_PHONE' })
    expect(normalizePhone('+506710915330000', 'CO')).toMatchObject({ errorCode: 'INVALID_PHONE' })
  })
})
