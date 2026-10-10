import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const migration = readFileSync('supabase/migrations/20261010120000_campaign_content_variants_v1.sql', 'utf8')
const form = readFileSync('app/app/campaigns/new/campaign-form.tsx', 'utf8')
const api = readFileSync('app/api/campaigns/route.ts', 'utf8')
const detail = readFileSync('app/api/campaigns/[id]/route.ts', 'utf8')

describe('campaign content variants v1 contract', () => {
  it('adds variant-aware immutable snapshot columns and uniqueness', () => {
    expect(migration).toContain('content_variant_key text not null default \'A\'')
    expect(migration).toContain('unique (campaign_id, content_variant_key, sequence_index)')
    expect(migration).toContain('campaign_recipients_content_variant_check')
    expect(migration).toContain('create or replace function public.create_campaign_with_variants')
    expect(migration).toContain('cr.content_variant_key')
    expect(migration).toContain('drop constraint if exists campaign_sequence_steps_variant_unique')
  })

  it('uses deterministic round-robin assignment after stable ordering', () => {
    expect(migration).toContain("md5(v_campaign_id::text || ':' || c.id::text)")
    expect(migration).toContain('(eligible.assignment_index % v_variant_count)')
    expect(migration).toContain('step.content_variant_key = cr.content_variant_key')
    expect(migration).not.toContain('contact_channel_permissions')
    expect(migration).not.toContain('make_interval(days')
  })

  it('separates image caption templates from audio content validation', () => {
    expect(migration).toContain("elsif v_step->>'type' = 'IMAGE' then")
    expect(migration).toContain("elsif v_step->>'type' = 'AUDIO' then")
    expect(migration).not.toContain("if v_step::text ~ '\\\\{\\\\{'")
    expect(migration).toContain('INVALID_AUDIO_CONTENT')
  })

  it('keeps the composer variant-aware and the monitor exposes recipient variants', () => {
    expect(form).toContain('+ Añadir variante')
    expect(form).toContain('validateContentVariants')
    expect(form).toContain('disabled={recordingActive}')
    expect(form).toContain('Detén la grabación antes de cambiar de versión.')
    expect(api).toContain("rpc('create_campaign_with_variants'")
    expect(detail).toContain('content_variant_key')
    expect(detail).toContain('variantSummaries')
  })
})
