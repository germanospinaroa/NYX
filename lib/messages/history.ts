export type HistoryMessage = { status: string; message_type?: string | null }

export function historyMessageType(messageType?: string | null) {
  if (messageType === 'IMAGE') return 'Imagen'
  if (messageType === 'AUDIO') return 'Audio'
  return 'Texto'
}

export function historySequenceStatus(messages: HistoryMessage[]) {
  if (messages.some((message) => message.status === 'OUTCOME_UNKNOWN')) return 'Resultado incierto'
  if (messages.some((message) => message.status === 'FAILED')) return 'No se pudo completar'
  if (messages.some((message) => message.status === 'QUEUED' || message.status === 'SENDING')) return 'En proceso'
  if (messages.some((message) => message.status === 'CANCELLED')) return 'No se completó'
  if (messages.length > 0 && messages.every((message) => message.status === 'SENT')) return 'Enviado'
  return 'En revisión'
}
