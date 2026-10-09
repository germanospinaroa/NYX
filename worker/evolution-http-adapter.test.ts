import { afterEach, describe, expect, it, vi } from 'vitest'
import { EvolutionHttpAdapter } from './evolution-http-adapter'
import { OutcomeUnknownError, ProviderRejectedError } from '../lib/evolution/adapter'

const originalEnv = { ...process.env }

afterEach(() => {
  process.env = { ...originalEnv }
  vi.restoreAllMocks()
})

function adapter() {
  process.env.EVOLUTION_BASE_URL = 'https://evolution.example.test'
  process.env['EVOLUTION_API_KEY'] = ['test', 'key'].join('-')
  process.env.EVOLUTION_INSTANCE = 'nyx-contract-test'
  return new EvolutionHttpAdapter()
}

describe('Evolution audio multipart transport', () => {
  it('sends the audio bytes as multipart without overriding the boundary', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ key: { id: 'provider-id' } }), { status: 201 }))
    await adapter().sendAudio({ instance: '', destination: '+573000000000', audio: new Blob(['audio-bytes']), mimeType: 'audio/webm', fileName: 'voice.webm' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://evolution.example.test/message/sendWhatsAppAudio/nyx-contract-test')
    expect(init?.headers).toEqual({ apikey: 'test-key' })
    expect(init?.body).toBeInstanceOf(FormData)
    const form = init?.body as FormData
    expect(form.get('number')).toBe('+573000000000')
    expect(form.get('encoding')).toBe('true')
    const file = form.get('file') as File
    expect(file.name).toBe('voice.webm')
    expect(file.type).toBe('audio/webm')
    expect(await file.text()).toBe('audio-bytes')
    expect(fetchMock.mock.calls[0][1]?.headers).not.toHaveProperty('content-type')
  })

  it('distinguishes provider rejection from ambiguous outcomes', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 400 }))
    await expect(adapter().sendAudio({ instance: '', destination: '+573000000000', audio: new Blob(['x']), mimeType: 'audio/ogg', fileName: 'voice.ogg' })).rejects.toBeInstanceOf(ProviderRejectedError)
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 500 }))
    await expect(adapter().sendAudio({ instance: '', destination: '+573000000000', audio: new Blob(['x']), mimeType: 'audio/ogg', fileName: 'voice.ogg' })).rejects.toBeInstanceOf(OutcomeUnknownError)
  })
})
