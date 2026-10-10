export const TERMINAL_CAMPAIGN_STATUSES = ['COMPLETED', 'FAILED', 'CANCELLED'] as const
export const ACTIVE_CAMPAIGN_STATUSES = ['QUEUED', 'RUNNING', 'PAUSED'] as const
export const TERMINAL_MESSAGE_STATUSES = ['SENT', 'FAILED', 'OUTCOME_UNKNOWN', 'CANCELLED'] as const

export type CampaignRecipientSummary = { status: string; content_variant_key?: string | null; messages?: CampaignMessageSummary[] }
export type CampaignMessageSummary = { status: string }

export type CampaignSummaryInput = {
  id: string
  name: string | null
  status: string
  created_at: string
  started_at?: string | null
  completed_at?: string | null
  scheduled_at?: string | null
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
  variantSummaries: Array<{ key: string; recipients: number; completed: number; failed: number; unknown: number; pending: number; sentMessages: number }>
}

export function humanCampaignStatus(status: string, sentRecipients = 0): string {
  if (status === 'READY') return 'Lista para enviar'
  if (status === 'SCHEDULED') return 'Programada'
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

export function humanMessageType(type: string): string {
  return type === 'IMAGE' ? 'Imagen' : type === 'AUDIO' ? 'Audio' : 'Texto'
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
  const variantKeys = [...new Set(recipients.map((item) => item.content_variant_key || 'A'))]
  const variantSummaries = variantKeys.map((key) => {
    const assigned = recipients.filter((item) => (item.content_variant_key || 'A') === key)
    const completed = assigned.filter((item) => item.status === 'SENT').length
    const failed = assigned.filter((item) => item.status === 'FAILED').length
    const unknown = assigned.filter((item) => item.status === 'OUTCOME_UNKNOWN').length
    return { key, recipients: assigned.length, completed, failed, unknown, pending: assigned.length - completed - failed - unknown - assigned.filter((item) => item.status === 'CANCELLED').length, sentMessages: assigned.reduce((total, item) => total + (item.messages ?? []).filter((message) => message.status === 'SENT').length, 0) }
  })
  return { ...input, totalRecipients: recipients.length, sentRecipients, failedRecipients, unknownRecipients, cancelledRecipients, pendingRecipients: Math.max(0, recipients.length - processedRecipients), processedRecipients, totalMessages: messages.length, processedMessages, progressPercent: recipients.length ? Math.round((processedRecipients / recipients.length) * 100) : 0, humanStatus: humanCampaignStatus(input.status, sentRecipients), isPolling: ACTIVE_CAMPAIGN_STATUSES.includes(input.status as typeof ACTIVE_CAMPAIGN_STATUSES[number]), variantSummaries }
}

export function publicFailureReason(code: string | null | undefined): string | null {
  if (!code) return null
  if (code === 'OUTCOME_UNKNOWN' || code === 'RESULT_PERSIST_FAILED') return 'Resultado incierto'
  if (code === 'MEDIA_URL_FAILED') return 'Error al procesar imagen'
  if (code === 'PROVIDER_FAILED') return 'Error del proveedor'
  return 'No se pudo enviar'
}
