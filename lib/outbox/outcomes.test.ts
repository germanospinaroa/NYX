import { describe, expect, it } from 'vitest'
import { classifyDispatch } from './outcomes'
import { OutcomeUnknownError } from '@/lib/evolution/adapter'

describe('outbox dispatch outcomes', () => {
  it('keeps ambiguous dispatches out of automatic failed/retry semantics', () => {
    expect(classifyDispatch(new OutcomeUnknownError())).toBe('OUTCOME_UNKNOWN')
    expect(classifyDispatch(new Error('timeout'))).toBe('FAILED')
    expect(classifyDispatch(null)).toBe('SENT')
  })
})
