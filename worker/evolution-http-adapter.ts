import { OutcomeUnknownError, ProviderRejectedError, type EvolutionAdapter, type ProviderAccepted, type SendAudioInput, type SendMediaInput, type SendTextInput } from '../lib/evolution/adapter'

export class EvolutionHttpAdapter implements EvolutionAdapter {
  private readonly baseUrl = required('EVOLUTION_BASE_URL').replace(/\/$/u, '')
  private readonly apiKey = required('EVOLUTION_API_KEY')
  private readonly instance = required('EVOLUTION_INSTANCE')

  async sendText(input: SendTextInput): Promise<ProviderAccepted> {
    return this.postJson(`/message/sendText/${encodeURIComponent(this.instance)}`, { number: input.destination, text: input.text })
  }

  async sendMedia(input: SendMediaInput): Promise<ProviderAccepted> {
    return this.postJson(`/message/sendMedia/${encodeURIComponent(this.instance)}`, { number: input.destination, mediatype: 'image', media: input.mediaUrl, caption: input.caption ?? input.text })
  }
  async sendAudio(input: SendAudioInput): Promise<ProviderAccepted> {
    const form = new FormData()
    form.append('number', input.destination)
    form.append('encoding', String(input.encoding ?? true))
    form.append('file', toBlob(input.audio, input.mimeType), input.fileName)
    return this.postForm(`/message/sendWhatsAppAudio/${encodeURIComponent(this.instance)}`, form)
  }

  private async postJson(path: string, payload: Record<string, string | boolean>) {
    return this.postRequest(path, { headers: { apikey: this.apiKey, 'content-type': 'application/json' }, body: JSON.stringify(payload) })
  }

  private async postForm(path: string, body: FormData) {
    return this.postRequest(path, { headers: { apikey: this.apiKey }, body })
  }

  private async postRequest(path: string, init: RequestInit) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), Number(process.env.EVOLUTION_REQUEST_TIMEOUT_MS ?? 15000))
    try {
      const response = await fetch(`${this.baseUrl}${path}`, { ...init, method: 'POST', signal: controller.signal })
      const body = await response.json().catch(() => ({})) as { key?: { id?: string; remoteJid?: string }; status?: string }
      if (!response.ok) { if (response.status >= 500) throw new OutcomeUnknownError(`Evolution server response ${response.status}`); throw new ProviderRejectedError(response.status) }
      if (!body.key?.id) throw new OutcomeUnknownError('Evolution accepted without provider message id')
      return { providerMessageId: body.key.id, remoteJid: body.key.remoteJid, status: body.status }
    } catch (error) {
      if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TypeError')) throw new OutcomeUnknownError()
      throw error
    } finally { clearTimeout(timer) }
  }
}

function toBlob(audio: SendAudioInput['audio'], mimeType: string) {
  if (audio instanceof Blob) return audio
  return new Blob([audio as BlobPart], { type: mimeType })
}

function required(name: string) { const value = process.env[name]; if (!value) throw new Error(`${name}_NOT_CONFIGURED`); return value }
