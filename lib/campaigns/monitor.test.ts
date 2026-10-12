import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { humanCampaignStatus, humanMessageStatus, humanMessageType, humanRecipientStatus, initials, summarizeCampaign } from './monitor'

const list = readFileSync(resolve(process.cwd(), 'app/app/campaigns/campaign-list.tsx'), 'utf8')
const detail = readFileSync(resolve(process.cwd(), 'app/app/campaigns/[id]/campaign-detail.tsx'), 'utf8')
const api = readFileSync(resolve(process.cwd(), 'app/api/campaigns/[id]/route.ts'), 'utf8')

describe('campaign live monitor', () => {
  it('derives partial failure progress by recipient', () => {
    const summary = summarizeCampaign({ id: 'c', name: 'Test', status: 'FAILED', created_at: '', campaign_recipients: [{ status: 'SENT' }, { status: 'FAILED' }], messages: [{ status: 'SENT' }, { status: 'SENT' }, { status: 'FAILED' }, { status: 'CANCELLED' }] })
    expect(summary.sentRecipients).toBe(1)
    expect(summary.failedRecipients).toBe(1)
    expect(summary.processedRecipients).toBe(2)
    expect(summary.pendingRecipients).toBe(0)
    expect(summary.progressPercent).toBe(100)
    expect(summary.humanStatus).toBe('Finalizada con incidencias')
  })

  it('distinguishes full failure and human states', () => {
    expect(humanCampaignStatus('FAILED', 0)).toBe('Fallida')
    expect(humanCampaignStatus('QUEUED')).toBe('Iniciando envío…')
    expect(humanMessageStatus('OUTCOME_UNKNOWN')).toBe('Resultado incierto')
    expect(humanRecipientStatus('QUEUED', true)).toBe('En proceso')
    expect(humanRecipientStatus('SENT')).toBe('Completado')
    expect(humanMessageType('AUDIO')).toBe('Audio')
  })

  it('builds initials from the first and last name tokens', () => {
    expect(initials('María Fernanda Gómez')).toBe('MG')
    expect(initials('Juan Carlos Pérez López')).toBe('JL')
    expect(initials('Carlos Rivera')).toBe('CR')
    expect(initials('Andrea')).toBe('A')
    expect(initials('Contacto')).toBe('C')
    expect(initials('   ')).toBe('C')
  })

  it('defines polling, focus/visibility refresh and overlap protection', () => {
    expect(list).toContain('setInterval')
    expect(list).toContain('2000')
    expect(list).toContain('inFlight')
    expect(list).toContain("addEventListener('focus'")
    expect(list).toContain("addEventListener('visibilitychange'")
    expect(list).toContain('clearInterval')
    expect(list).toContain('abort()')
    expect(detail).toContain('setInterval')
  })

  it('keeps detail owner-scoped and excludes provider/media internals', () => {
    expect(api).toContain("eq('id', id).eq('owner_id', user.id)")
    expect(api).toContain("eq('campaign_id', id).eq('owner_id', user.id)")
    expect(api).toContain('first_name_snapshot, display_name_snapshot, phone_snapshot')
    expect(api).toContain('contactName: recipient.display_name_snapshot')
    expect(api).toContain('contactPhone: recipient.phone_snapshot')
    expect(api).toContain('contacts(display_name, phone_e164)')
    expect(api).not.toContain('provider_message_id')
    expect(api).not.toContain('media_path')
    expect(api).not.toContain('raw provider')
  })

  it('renders failed-step cancellation without exposing technical errors', () => {
    expect(detail).toContain('No enviado porque un paso anterior falló')
    expect(detail).toContain('failureReason')
    expect(detail).not.toContain('provider_message_id')
    expect(detail).not.toContain('media_path')
  })

  it('renders recipient phone only inside expanded details', () => {
    expect(detail).toContain('contactPhone: string | null')
    expect(detail).toContain('Teléfono no disponible')
    expect(detail).toContain('recipient.contactPhone')
    expect(detail).toContain('initials(recipient.contactName)')
  })
})
