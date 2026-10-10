import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261008200000_campaign_sequences_v1.sql'), 'utf8')
const api = readFileSync(resolve(process.cwd(), 'app/api/campaigns/route.ts'), 'utf8')
const form = readFileSync(resolve(process.cwd(), 'app/app/campaigns/new/campaign-form.tsx'), 'utf8')
const worker = readFileSync(resolve(process.cwd(), 'worker/outbox-worker.ts'), 'utf8')
const e164 = /^\+[1-9][0-9]{7,14}$/

function resolveVariant(gender: 'MALE' | 'FEMALE' | 'UNKNOWN', neutral: string, male?: string, female?: string) {
  return gender === 'MALE' ? (male || neutral) : gender === 'FEMALE' ? (female || neutral) : neutral
}

describe('campaign sequence v1 contract', () => {
  it('fixes campaign recipient E.164 and preserves immutable snapshot destination', () => {
    expect(e164.test('+573000000000')).toBe(true)
    expect(e164.test('+14155552671')).toBe(true)
    expect(e164.test('573000000000')).toBe(false)
    expect(migration).toContain("phone_snapshot ~ '^\\+[1-9][0-9]{7,14}$'")
    expect(migration).not.toContain("phone_snapshot ~ '^\\\\+[1-9][0-9]{7,14}$'")
    expect(migration).toContain('cr.phone_snapshot')
    expect(migration).not.toContain('destination,\n    c.phone_e164')
  })

  it('creates one ordered sequence per campaign recipient with capped steps', () => {
    expect(migration).toContain('campaign_sequence_steps')
    expect(migration).toContain('jsonb_array_length(p_steps) > 50')
    expect(migration).toContain('campaign_recipient_id')
    expect(migration).toContain('step.sequence_index')
    expect(migration).toContain('create_campaign_with_snapshot')
    expect(api).toContain("rpc('create_campaign_with_variants'")
    expect(api).not.toContain("rpc('create_campaign_snapshot'")
    expect(migration).toContain('revoke execute on function public.create_campaign_snapshot(uuid, uuid[]) from authenticated')
  })

  it('resolves gender variants with neutral fallback', () => {
    expect(resolveVariant('MALE', 'neutral', 'male', 'female')).toBe('male')
    expect(resolveVariant('FEMALE', 'neutral', undefined, 'female')).toBe('female')
    expect(resolveVariant('MALE', 'neutral', undefined, 'female')).toBe('neutral')
    expect(resolveVariant('UNKNOWN', 'neutral', 'male', 'female')).toBe('neutral')
  })

  it('keeps recipient completion behind sequence reconciliation', () => {
    expect(migration).toContain('refresh_campaign_recipient_status')
    expect(worker).toContain("rpc('refresh_campaign_recipient_status'")
    expect(worker).toContain("rpc('refresh_message_sequence_status'")
    expect(worker).toContain("update({ status: 'SENT' })")
  })

  it('uses a product-facing sequence composer and upload, not storage URLs', () => {
    expect(form).toContain('Preparar campaña')
    expect(form).toContain('Subir imagen')
    expect(form).toContain('+ Imagen')
    expect(form).toContain('mediaPath')
    expect(form).not.toContain('URL HTTPS de Storage')
    expect(form).not.toContain('outbox')
    expect(form).not.toContain('worker')
  })
})
