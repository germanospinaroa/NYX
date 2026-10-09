import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261008180000_harden_message_sequences.sql'), 'utf8')
const worker = readFileSync(resolve(process.cwd(), 'worker/outbox-worker.ts'), 'utf8')

describe('message sequence release hardening', () => {
  it('resolves terminal failures before queued work and cancels only queued steps', () => {
    expect(migration).toContain("status = 'OUTCOME_UNKNOWN'")
    expect(migration).toContain("status = 'FAILED'")
    expect(migration).toContain("where sequence_id = p_sequence_id and status = 'QUEUED'")
    expect(migration).toContain("s.status in ('QUEUED', 'SENDING')")
    expect(migration).toContain('for update skip locked')
    expect(migration).toContain("previous.status = 'SENT'")
    expect(migration).toContain("status = 'CANCELLED'")
    expect(migration).toContain('completed_at = now()')
    expect(migration).toContain("v_next := 'SENT'")
  })

  it('keeps individual enqueue separate from immutable campaign snapshots', () => {
    expect(migration).toContain('CAMPAIGN_SEQUENCE_NOT_SUPPORTED')
    expect(migration).toContain("'caption', coalesce(p_message_text, '')")
    expect(migration).toContain("'mediaPath', p_media_path")
  })

  it('hardens storage and composite foreign keys', () => {
    expect(migration).toContain('file_size_limit = 8388608')
    expect(migration).toContain("array['image/jpeg', 'image/png', 'image/webp']::text[]")
    expect(migration).toContain('message_sequences_campaign_owner_idx')
    expect(migration).toContain('message_sequences_contact_owner_idx')
    expect(migration).toContain('messages_sequence_owner_idx')
  })

  it('creates media URLs only at worker dispatch time', () => {
    expect(worker).toContain('createSignedUrl(path, 3600)')
    expect(worker).not.toContain('createSignedUrl(message.media_path')
  })
})
