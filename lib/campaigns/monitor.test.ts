import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { countRecipientsByFilter, filterRecipients, humanCampaignStatus, humanMessageStatus, humanMessageType, humanRecipientStatus, initials, summarizeCampaign } from './monitor'

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

  it('filters recipients by recipient status and keeps alphabetical order', () => {
    const recipients = [
      { id: '2', contactName: 'Zoe Beta', status: 'FAILED' },
      { id: '1', contactName: 'Ana Alfa', status: 'SENT' },
      { id: '3', contactName: 'Bruno Gamma', status: 'QUEUED' },
      { id: '4', contactName: 'Carla Delta', status: 'OUTCOME_UNKNOWN' },
      { id: '5', contactName: 'Diana Épsilon', status: 'CANCELLED' },
    ]
    expect(filterRecipients(recipients, 'SENT').map((recipient) => recipient.id)).toEqual(['1'])
    expect(filterRecipients(recipients, 'FAILED').map((recipient) => recipient.id)).toEqual(['2'])
    expect(filterRecipients(recipients, 'OUTCOME_UNKNOWN').map((recipient) => recipient.id)).toEqual(['4'])
    expect(filterRecipients(recipients, 'PENDING').map((recipient) => recipient.id)).toEqual(['3'])
    expect(filterRecipients(recipients, 'ALL').map((recipient) => recipient.id)).toEqual(['1', '3', '4', '5', '2'])
    expect(countRecipientsByFilter(recipients, 'SENT')).toBe(1)
    expect(countRecipientsByFilter(recipients, 'FAILED')).toBe(1)
    expect(countRecipientsByFilter(recipients, 'OUTCOME_UNKNOWN')).toBe(1)
    expect(countRecipientsByFilter(recipients, 'PENDING')).toBe(1)
  })

  it('keeps filtering based on recipient status when steps have mixed outcomes', () => {
    const recipients = [{ id: '1', contactName: 'Ana Alfa', status: 'FAILED', steps: [{ status: 'SENT' }, { status: 'FAILED' }] }]
    expect(filterRecipients(recipients, 'FAILED')).toHaveLength(1)
    expect(filterRecipients(recipients, 'SENT')).toHaveLength(0)
  })

  it('matches the monitor counts and restores the full list after an update', () => {
    const initial = [
      ...Array.from({ length: 50 }, (_, index) => ({ id: `sent-${index}`, contactName: `Contacto ${index}`, status: 'SENT' })),
      { id: 'failed-1', contactName: 'Contacto Fallo 1', status: 'FAILED' },
      { id: 'failed-2', contactName: 'Contacto Fallo 2', status: 'FAILED' },
    ]
    expect(filterRecipients(initial, 'SENT')).toHaveLength(50)
    expect(filterRecipients(initial, 'FAILED')).toHaveLength(2)
    expect(filterRecipients(initial, 'OUTCOME_UNKNOWN')).toHaveLength(0)
    expect(filterRecipients(initial, 'PENDING')).toHaveLength(0)

    const updated = [...initial, { id: 'failed-3', contactName: 'Contacto Fallo 3', status: 'FAILED' }]
    expect(filterRecipients(updated, 'FAILED')).toHaveLength(3)
    expect(filterRecipients(updated, 'ALL')).toHaveLength(53)
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
