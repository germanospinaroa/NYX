import { afterEach, describe, expect, it, vi } from 'vitest'
import { getEvolutionConnectionSnapshot, getEvolutionConnectionState } from './connection'

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

  it('exposes connecting state and masks a linked owner number', async () => {
    process.env.EVOLUTION_BASE_URL = 'https://evolution.example.test'
    process.env.EVOLUTION_API_KEY = 'test-key'
    process.env.EVOLUTION_INSTANCE = 'nyx-test'
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ instance: { instanceName: 'nyx-test', state: 'connecting', owner: '573001234567@s.whatsapp.net' } }), { status: 200 }))
    await expect(getEvolutionConnectionSnapshot()).resolves.toMatchObject({ state: 'CONNECTING', instance: 'nyx-test', linkedNumber: '••••4567' })
  })

  it('classifies provider communication failures separately from a disconnected instance', async () => {
    process.env.EVOLUTION_BASE_URL = 'https://evolution.example.test'
    process.env.EVOLUTION_API_KEY = 'test-key'
    process.env.EVOLUTION_INSTANCE = 'nyx-test'
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }))
    await expect(getEvolutionConnectionSnapshot()).resolves.toMatchObject({ state: 'ERROR', instance: 'nyx-test', linkedNumber: null })
  })
})
