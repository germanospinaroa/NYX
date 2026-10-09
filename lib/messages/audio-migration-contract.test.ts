import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('audio migration contract', () => {
  const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261009150000_audio_messages_v1.sql'), 'utf8')
  it('is forward-only and defines the three native types and storage limits', () => {
    expect(sql).toContain("message_type in ('TEXT','IMAGE','AUDIO')")
    expect(sql).toContain("allowed_mime_types = array['image/jpeg','image/png','image/webp','audio/webm','audio/ogg','audio/mp4','audio/mpeg']")
    expect(sql).toContain('file_size_limit = 16777216')
    expect(sql).toContain('media_duration_ms')
    expect(sql).toContain('CAMPAIGN_SEQUENCE_NOT_SUPPORTED')
  })
})
