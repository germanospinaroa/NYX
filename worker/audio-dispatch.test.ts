import { describe, expect, it, vi } from 'vitest'
import { dispatchMessage } from './outbox-worker'
import type { EvolutionAdapter, ProviderAccepted } from '../lib/evolution/adapter'

const accepted: ProviderAccepted = { providerMessageId: 'provider-id' }

function adapter() {
  return { sendText: vi.fn().mockResolvedValue(accepted), sendMedia: vi.fn().mockResolvedValue(accepted), sendAudio: vi.fn().mockResolvedValue(accepted) } as unknown as EvolutionAdapter
}

function storage() {
  return { download: vi.fn().mockResolvedValue({ data: new Blob(['audio'], { type: 'audio/webm' }), error: null }), createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed.example.test/image' }, error: null }) }
}

describe('worker media dispatch contract', () => {
  it('downloads AUDIO bytes and never creates an audio signed URL', async () => {
    const media = storage(); const api = { storage: { from: vi.fn().mockReturnValue(media) } }; const provider = adapter()
    await dispatchMessage(api as never, provider, { id: '1', destination: '+573000000000', message_text: '', message_type: 'AUDIO', media_path: 'owner/voice.webm', media_mime_type: 'audio/webm' })
    expect(media.download).toHaveBeenCalledWith('owner/voice.webm')
    expect(media.createSignedUrl).not.toHaveBeenCalled()
    expect(provider.sendAudio).toHaveBeenCalledWith(expect.objectContaining({ mimeType: 'audio/webm', fileName: 'voice.webm', audio: expect.any(Blob) }))
  })

  it('keeps IMAGE on signed URL transport', async () => {
    const media = storage(); const api = { storage: { from: vi.fn().mockReturnValue(media) } }; const provider = adapter()
    await dispatchMessage(api as never, provider, { id: '1', destination: '+573000000000', message_text: '', message_type: 'IMAGE', caption: 'caption', media_path: 'owner/image.png' })
    expect(media.download).not.toHaveBeenCalled()
    expect(media.createSignedUrl).toHaveBeenCalledWith('owner/image.png', 3600)
    expect(provider.sendMedia).toHaveBeenCalledWith(expect.objectContaining({ mediaUrl: 'https://signed.example.test/image' }))
  })

  it('keeps TEXT independent of Storage', async () => {
    const media = storage(); const api = { storage: { from: vi.fn().mockReturnValue(media) } }; const provider = adapter()
    await dispatchMessage(api as never, provider, { id: '1', destination: '+573000000000', message_text: 'Hola', message_type: 'TEXT' })
    expect(media.download).not.toHaveBeenCalled()
    expect(media.createSignedUrl).not.toHaveBeenCalled()
    expect(provider.sendText).toHaveBeenCalledWith(expect.objectContaining({ text: 'Hola' }))
  })

  it('rejects unsupported audio before provider dispatch', async () => {
    const media = storage(); media.download.mockResolvedValueOnce({ data: new Blob(['x'], { type: 'audio/wav' }), error: null }); const api = { storage: { from: vi.fn().mockReturnValue(media) } }; const provider = adapter()
    await expect(dispatchMessage(api as never, provider, { id: '1', destination: '+573000000000', message_text: '', message_type: 'AUDIO', media_path: 'owner/voice.wav', media_mime_type: 'audio/wav' })).rejects.toThrow('MEDIA_DOWNLOAD_FAILED')
    expect(provider.sendAudio).not.toHaveBeenCalled()
  })
})
