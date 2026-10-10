import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const endpoint = readFileSync('app/api/campaigns/[id]/reuse/route.ts', 'utf8')
const form = readFileSync('app/app/campaigns/new/campaign-form.tsx', 'utf8')
const list = readFileSync('app/app/campaigns/campaign-list.tsx', 'utf8')
const detail = readFileSync('app/app/campaigns/[id]/campaign-detail.tsx', 'utf8')

describe('campaign reuse contracts', () => {
  it('is authenticated and owner-scoped for every source query', () => {
    expect(endpoint).toContain('requireUser()')
    expect(endpoint.match(/\.eq\('owner_id', user\.id\)/g)).toHaveLength(3)
    expect(endpoint).not.toContain("from('messages')")
    expect(endpoint).not.toContain('phone_snapshot')
    expect(endpoint).toContain('CAMPAIGN_REUSE_FAILED')
  })

  it('returns template content rather than recipient message snapshots', () => {
    expect(endpoint).toContain('reconstructCampaignTemplate')
    expect(endpoint).toContain('selection: { mode: \'ids\', contactIds: template.contactIds }')
    expect(endpoint).toContain('sourceCampaignId')
    expect(endpoint).toContain('sourceName')
  })

  it('lets a source campaign override stale session selection and creates fresh step ids', () => {
    expect(form).toContain("const fromId = searchParams.get('from')")
    expect(form).toContain("fetch(`/api/campaigns/${encodeURIComponent(fromId)}/reuse`")
    expect(form).toContain("if (fromId) return")
    expect(form).toContain("sessionStorage.removeItem('nyx-campaign-selection')")
    expect(form).toContain('id: crypto.randomUUID()')
    expect(form).toContain('templateLoading')
    expect(form).toContain('templateSourceName')
  })

  it('keeps reuse as a new editable composer action', () => {
    expect(list).toContain('Reutilizar campaña')
    expect(detail).toContain('Reutilizar campaña')
    expect(form).toContain('Preparar campaña')
  })
})
