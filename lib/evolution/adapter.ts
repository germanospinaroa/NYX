export type SendTextInput = { instance: string; destination: string; text: string }
export type SendMediaInput = SendTextInput & { mediaUrl: string; caption?: string }
export type SendAudioInput = Omit<SendTextInput, 'text'> & { audio: Blob | ArrayBuffer | Uint8Array; mimeType: string; fileName: string; encoding?: boolean }
export type ProviderAccepted = { providerMessageId: string; remoteJid?: string; status?: string }

export class OutcomeUnknownError extends Error {
  constructor(message = 'Evolution response outcome is unknown') { super(message); this.name = 'OutcomeUnknownError' }
}

export class ProviderRejectedError extends Error {
  readonly status: number
  constructor(status: number) { super(`Evolution rejected dispatch with HTTP ${status}`); this.name = 'ProviderRejectedError'; this.status = status }
}

export interface EvolutionAdapter {
  sendText(input: SendTextInput): Promise<ProviderAccepted>
  sendMedia(input: SendMediaInput): Promise<ProviderAccepted>
  sendAudio(input: SendAudioInput): Promise<ProviderAccepted>
}

export class MockEvolutionAdapter implements EvolutionAdapter {
  async sendText(input: SendTextInput): Promise<ProviderAccepted> { return { providerMessageId: `mock-${input.destination}`, status: 'PENDING' } }
  async sendMedia(input: SendMediaInput): Promise<ProviderAccepted> { return { providerMessageId: `mock-media-${input.destination}`, status: 'PENDING' } }
  async sendAudio(input: SendAudioInput): Promise<ProviderAccepted> { return { providerMessageId: `mock-audio-${input.destination}`, status: 'PENDING' } }
}
