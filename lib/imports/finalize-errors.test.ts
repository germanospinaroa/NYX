import { describe, expect, it } from 'vitest'
import { finalizeErrorMessage, finalizeErrorStatus, getFinalizeDomainError } from './finalize-errors'

describe('finalize error contract', () => {
  it('maps known domain errors without exposing database details', () => {
    const error = new Error('IMPORT_INVALID_INCLUDED_ROWS')

    expect(getFinalizeDomainError(error)).toBe('IMPORT_INVALID_INCLUDED_ROWS')
    expect(finalizeErrorStatus('IMPORT_INVALID_INCLUDED_ROWS')).toBe(409)
    expect(finalizeErrorMessage('IMPORT_INVALID_INCLUDED_ROWS')).toContain('filas incluidas inválidas')
    expect(finalizeErrorMessage('IMPORT_INVALID_INCLUDED_ROWS')).not.toContain('SQL')
  })

  it('returns a diagnostic code for unexpected failures', () => {
    expect(getFinalizeDomainError(new Error('database detail'))).toBeNull()
    expect(finalizeErrorMessage('IMPORT_FINALIZE_FAILED', 'correlation-id')).toContain('correlation-id')
  })
})
