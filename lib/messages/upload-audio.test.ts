import { describe, expect, it } from 'vitest'
import { MAX_AUDIO_BYTES, validateAudioFile } from './upload'

describe('audio upload contract', () => {
  it('accepts supported audio and caps size', () => {
    expect(validateAudioFile({ type: 'audio/webm', size: 100 })).toBeNull()
    expect(validateAudioFile({ type: 'audio/mp4', size: MAX_AUDIO_BYTES + 1 })).toBeTruthy()
    expect(validateAudioFile({ type: 'audio/wav', size: 100 })).toBeTruthy()
  })
})
