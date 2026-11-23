import { afterEach, describe, expect, it, vi } from 'vitest'
import { getEvolutionConnectionState } from './connection'

describe('Evolution connection state', () => {
  afterEach(() => { vi.restoreAllMocks(); delete process.env.EVOLUTION_BASE_URL; delete process.env.EVOLUTION_API_KEY; delete process.env.EVOLUTION_INSTANCE })

  it('accepts only an explicit open state', async () => {
    process.env.EVOLUTION_BASE_URL = 'https://evolution.example.test'
    process.env.EVOLUTION_API_KEY = 'test-key'
    process.env.EVOLUTION_INSTANCE = 'nyx-test'
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ instance: { state: 'open' } }), { status: 200 }))
    await expect(getEvolutionConnectionState()).resolves.toBe('CONNECTED')
  })

  it('returns unknown for timeouts, invalid responses and failures', async () => {
    process.env.EVOLUTION_BASE_URL = 'https://evolution.example.test'
    process.env.EVOLUTION_API_KEY = 'test-key'
    process.env.EVOLUTION_INSTANCE = 'nyx-test'
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ instance: { state: 'maybe' } }), { status: 200 }))
    await expect(getEvolutionConnectionState()).resolves.toBe('UNKNOWN')
  })
})
