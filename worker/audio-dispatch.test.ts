import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('worker audio dispatch contract', () => {
  const source = readFileSync('worker/outbox-worker.ts', 'utf8')
  it('dispatches by explicit message type and resolves media at send time', () => {
    expect(source).toContain("message.message_type === 'AUDIO'")
    expect(source).toContain('adapter.sendAudio')
    expect(source).toContain('resolveMediaUrl')
    expect(source).toContain('createSignedUrl(path, 3600)')
    expect(source).toContain("message.message_type === 'IMAGE'")
  })
})
