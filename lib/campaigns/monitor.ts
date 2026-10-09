export const TERMINAL_CAMPAIGN_STATUSES = ['COMPLETED', 'FAILED', 'CANCELLED'] as const
export const ACTIVE_CAMPAIGN_STATUSES = ['QUEUED', 'RUNNING', 'PAUSED'] as const
export const TERMINAL_MESSAGE_STATUSES = ['SENT', 'FAILED', 'OUTCOME_UNKNOWN', 'CANCELLED'] as const

export type CampaignRecipientSummary = { status: string }
export type CampaignMessageSummary = { status: string }

export type CampaignSummaryInput = {
  id: string
  name: string | null
  status: string
  created_at: string
  started_at?: string | null
  completed_at?: string | null
  campaign_recipients?: CampaignRecipientSummary[]
  messages?: CampaignMessageSummary[]
}

export type CampaignSummary = CampaignSummaryInput & {
  totalRecipients: number
  sentRecipients: number
  failedRecipients: number
  unknownRecipients: number
  cancelledRecipients: number
  pendingRecipients: number
  processedRecipients: number
  totalMessages: number
  processedMessages: number
  progressPercent: number
  humanStatus: string
  isPolling: boolean
}

export function humanCampaignStatus(status: string, sentRecipients = 0): string {
  if (status === 'READY') return 'Lista para enviar'
  if (status === 'QUEUED') return 'Iniciando envío…'
  if (status === 'RUNNING') return 'Enviando…'
  if (status === 'PAUSED') return 'Pausada'
  if (status === 'COMPLETED') return 'Completada'
  if (status === 'FAILED') return sentRecipients > 0 ? 'Finalizada con incidencias' : 'Fallida'
  if (status === 'CANCELLED') return 'Cancelada'
  return 'En revisión'
}

export function humanMessageStatus(status: string): string {
  return ({ QUEUED: 'En cola', SENDING: 'Enviando', SENT: 'Enviado', FAILED: 'Falló', OUTCOME_UNKNOWN: 'Resultado incierto', CANCELLED: 'No enviado' } as Record<string, string>)[status] ?? 'Pendiente'
}

export function humanRecipientStatus(status: string, hasSentSteps = false): string {
  if (status === 'QUEUED' && hasSentSteps) return 'En proceso'
  return ({ QUEUED: 'Pendiente', SENT: 'Completado', FAILED: 'No se pudo completar', OUTCOME_UNKNOWN: 'Requiere revisión', CANCELLED: 'Cancelado' } as Record<string, string>)[status] ?? 'Pendiente'
}

export function summarizeCampaign(input: CampaignSummaryInput): CampaignSummary {
  const recipients = input.campaign_recipients ?? []
  const messages = input.messages ?? []
  const sentRecipients = recipients.filter((item) => item.status === 'SENT').length
  const failedRecipients = recipients.filter((item) => item.status === 'FAILED').length
  const unknownRecipients = recipients.filter((item) => item.status === 'OUTCOME_UNKNOWN').length
  const cancelledRecipients = recipients.filter((item) => item.status === 'CANCELLED').length
  const processedRecipients = sentRecipients + failedRecipients + unknownRecipients + cancelledRecipients
  const processedMessages = messages.filter((item) => TERMINAL_MESSAGE_STATUSES.includes(item.status as typeof TERMINAL_MESSAGE_STATUSES[number])).length
  return { ...input, totalRecipients: recipients.length, sentRecipients, failedRecipients, unknownRecipients, cancelledRecipients, pendingRecipients: Math.max(0, recipients.length - processedRecipients), processedRecipients, totalMessages: messages.length, processedMessages, progressPercent: recipients.length ? Math.round((processedRecipients / recipients.length) * 100) : 0, humanStatus: humanCampaignStatus(input.status, sentRecipients), isPolling: ACTIVE_CAMPAIGN_STATUSES.includes(input.status as typeof ACTIVE_CAMPAIGN_STATUSES[number]) }
}

export function publicFailureReason(code: string | null | undefined): string | null {
  if (!code) return null
  if (code === 'OUTCOME_UNKNOWN' || code === 'RESULT_PERSIST_FAILED') return 'Resultado incierto'
  if (code === 'MEDIA_URL_FAILED') return 'Error al procesar imagen'
  if (code === 'PROVIDER_FAILED') return 'Error del proveedor'
  return 'No se pudo enviar'
}
