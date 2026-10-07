import { describe, expect, it } from 'vitest'
import { normalizeName } from './name'

describe('normalizeName', () => {
  it('trims and collapses spaces while preserving Unicode', () => {
    expect(normalizeName('  María   José  Niño  ')).toEqual({
      displayName: 'María José Niño',
      firstName: 'María',
    })
  })

  it('rejects an unusable empty name', () => {
    expect(normalizeName('   ')).toEqual({ errorCode: 'INVALID_NAME' })
  })
})
