export const FINALIZE_DOMAIN_ERRORS = [
  'IMPORT_NOT_FOUND',
  'IMPORT_NOT_FINALIZABLE',
  'IMPORT_INVALID_INCLUDED_ROWS',
  'IMPORT_REVIEW_REQUIRED',
] as const

export type FinalizeDomainError = typeof FINALIZE_DOMAIN_ERRORS[number]

export function getFinalizeDomainError(error: unknown): FinalizeDomainError | null {
  const message = error instanceof Error ? error.message : ''
  return FINALIZE_DOMAIN_ERRORS.find((code) => message === code || message.includes(code)) ?? null
}

export function finalizeErrorStatus(error: FinalizeDomainError): number {
  return error === 'IMPORT_NOT_FOUND' ? 404 : 409
}

export function finalizeErrorMessage(error: unknown, correlationId?: string): string {
  const code = typeof error === 'string' ? error : ''
  const messages: Record<FinalizeDomainError, string> = {
    IMPORT_NOT_FOUND: 'No se encontró esta importación.',
    IMPORT_NOT_FINALIZABLE: 'La importación todavía no está lista para finalizar.',
    IMPORT_INVALID_INCLUDED_ROWS: 'Hay filas incluidas inválidas. Corrígelas o descártalas antes de finalizar.',
    IMPORT_REVIEW_REQUIRED: 'Aún hay filas incluidas que requieren revisión.',
  }
  if (Object.prototype.hasOwnProperty.call(messages, code)) return messages[code as FinalizeDomainError]
  return correlationId ? `No fue posible finalizar la importación. Código: ${correlationId}` : 'No fue posible finalizar la importación.'
}
