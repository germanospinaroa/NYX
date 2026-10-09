import { OutcomeUnknownError, type EvolutionAdapter, type ProviderAccepted, type SendAudioInput, type SendMediaInput, type SendTextInput } from '../lib/evolution/adapter'

export class EvolutionHttpAdapter implements EvolutionAdapter {
  private readonly baseUrl = required('EVOLUTION_BASE_URL').replace(/\/$/u, '')
  private readonly apiKey = required('EVOLUTION_API_KEY')
  private readonly instance = required('EVOLUTION_INSTANCE')

  async sendText(input: SendTextInput): Promise<ProviderAccepted> {
    return this.post(`/message/sendText/${encodeURIComponent(this.instance)}`, { number: input.destination, text: input.text })
  }

  async sendMedia(input: SendMediaInput): Promise<ProviderAccepted> {
    return this.post(`/message/sendMedia/${encodeURIComponent(this.instance)}`, { number: input.destination, mediatype: 'image', media: input.mediaUrl, caption: input.caption ?? input.text })
  }
  async sendAudio(input: SendAudioInput): Promise<ProviderAccepted> {
    return this.post(`/message/sendWhatsAppAudio/${encodeURIComponent(this.instance)}`, { number: input.destination, audio: input.audioUrl, encoding: input.encoding ?? true })
  }

  private async post(path: string, payload: Record<string, string | boolean>) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), Number(process.env.EVOLUTION_REQUEST_TIMEOUT_MS ?? 15000))
    try {
      const response = await fetch(`${this.baseUrl}${path}`, { method: 'POST', headers: { apikey: this.apiKey, 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal })
      const body = await response.json().catch(() => ({})) as { key?: { id?: string; remoteJid?: string }; status?: string }
      if (!response.ok) { if (response.status >= 500) throw new OutcomeUnknownError(`Evolution server response ${response.status}`); throw new Error(`EVOLUTION_HTTP_${response.status}`) }
      if (!body.key?.id) throw new OutcomeUnknownError('Evolution accepted without provider message id')
      return { providerMessageId: body.key.id, remoteJid: body.key.remoteJid, status: body.status }
    } catch (error) {
      if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TypeError')) throw new OutcomeUnknownError()
      throw error
    } finally { clearTimeout(timer) }
  }
}

function required(name: string) { const value = process.env[name]; if (!value) throw new Error(`${name}_NOT_CONFIGURED`); return value }
