export type DispatchOutcome = 'SENT' | 'FAILED' | 'OUTCOME_UNKNOWN'

export function classifyDispatch(error: unknown): DispatchOutcome {
  if (!error) return 'SENT'
  if (error instanceof Error && error.name === 'OutcomeUnknownError') return 'OUTCOME_UNKNOWN'
  return 'FAILED'
}
