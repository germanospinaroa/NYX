import { describe, expect, it } from 'vitest'
import { historyMessageType, historySequenceStatus } from './history'

describe('message history semantics', () => {
  it('maps AUDIO separately from text', () => {
    expect(historyMessageType('AUDIO')).toBe('Audio')
    expect(historyMessageType('IMAGE')).toBe('Imagen')
    expect(historyMessageType('TEXT')).toBe('Texto')
  })

  it('prioritizes ambiguous outcomes and failures', () => {
    expect(historySequenceStatus([{ status: 'SENT' }, { status: 'OUTCOME_UNKNOWN' }])).toBe('Resultado incierto')
    expect(historySequenceStatus([{ status: 'FAILED' }, { status: 'CANCELLED' }])).toBe('No se pudo completar')
    expect(historySequenceStatus([{ status: 'SENT' }, { status: 'QUEUED' }])).toBe('En proceso')
    expect(historySequenceStatus([{ status: 'SENT' }, { status: 'CANCELLED' }])).toBe('No se completó')
    expect(historySequenceStatus([{ status: 'SENT' }, { status: 'SENT' }])).toBe('Enviado')
  })
})
