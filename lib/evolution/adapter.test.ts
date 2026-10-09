import { describe, expect, it } from 'vitest'
import { MockEvolutionAdapter } from './adapter'

describe('audio provider contract', () => { it('keeps audio as an explicit adapter operation', async () => { const adapter = new MockEvolutionAdapter(); await expect(adapter.sendAudio({ instance: 'test', destination: '+573000000000', audio: new Blob(['audio']), mimeType: 'audio/webm', fileName: 'voice.webm', encoding: true })).resolves.toMatchObject({ providerMessageId: expect.stringContaining('mock-audio') }) }) })
