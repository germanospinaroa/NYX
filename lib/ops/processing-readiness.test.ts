import { describe, expect, it } from 'vitest'
import { processingBlockedReason, requiresProcessingReadiness, type ProcessingReadiness } from './processing-readiness'

const readiness = (evolutionState: ProcessingReadiness['evolutionState'], workerState: ProcessingReadiness['worker']['state']): ProcessingReadiness => ({
  evolutionState,
  worker: { state: workerState, lastSeenAt: null, workerCount: workerState === 'RUNNING' ? 1 : 0 },
  canProcess: evolutionState === 'CONNECTED' && workerState === 'RUNNING',
})

describe('processing readiness action gate', () => {
  it('blocks disconnected Evolution', () => expect(processingBlockedReason(readiness('DISCONNECTED', 'RUNNING'))).toBe('EVOLUTION_DISCONNECTED'))
  it('blocks an unverifiable worker', () => expect(processingBlockedReason(readiness('CONNECTED', 'UNKNOWN'))).toBe('WORKER_UNVERIFIED'))
  it('blocks unknown Evolution state', () => expect(processingBlockedReason(readiness('UNKNOWN', 'RUNNING'))).toBe('EVOLUTION_STATE_UNKNOWN'))
  it('allows processing only with both conditions verified', () => expect(readiness('CONNECTED', 'RUNNING').canProcess).toBe(true))
  it('requires readiness for START, RESUME and SCHEDULE only', () => {
    expect(requiresProcessingReadiness('START')).toBe(true)
    expect(requiresProcessingReadiness('RESUME')).toBe(true)
    expect(requiresProcessingReadiness('SCHEDULE')).toBe(true)
    expect(requiresProcessingReadiness('PAUSE')).toBe(false)
    expect(requiresProcessingReadiness('CANCEL')).toBe(false)
  })
})
