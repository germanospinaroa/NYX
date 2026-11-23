import { OutcomeUnknownError, ProviderRejectedError } from '../lib/evolution/adapter'
import { EvolutionHttpAdapter } from './evolution-http-adapter'
import { createWorkerClient, dispatchMessage } from './outbox-worker'

type DirectMessage = {
  id: string
  campaign_id: string | null
  campaign_recipient_id: string | null
  sequence_id: string | null
  destination: string
  message_text: string
  message_type?: 'TEXT' | 'IMAGE' | 'AUDIO' | null
  caption?: string | null
  media_path?: string | null
  media_mime_type?: string | null
  media_duration_ms?: number | null
}

export async function sendOneMessage(messageId: string, adapter = new EvolutionHttpAdapter()) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(messageId)) throw new Error('INVALID_MESSAGE_ID')
  if (adapter.getConnectionState && await adapter.getConnectionState() !== 'CONNECTED') throw new Error('EVOLUTION_NOT_CONNECTED')

  const supabase = createWorkerClient()
  const { data, error } = await supabase.rpc('claim_direct_message', { p_message_id: messageId })
  if (error) throw new Error('DIRECT_MESSAGE_CLAIM_FAILED')
  const message = ((data ?? []) as DirectMessage[])[0]
  if (!message) throw new Error('DIRECT_MESSAGE_NOT_ELIGIBLE')

  try {
    const accepted = await dispatchMessage(supabase, adapter, message)
    const { data: persisted, error: persistError } = await supabase.from('messages').update({ status: 'SENT', provider_message_id: accepted.providerMessageId, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', message.id).eq('status', 'SENDING').select('id').maybeSingle()
    if (persistError || !persisted) {
      await supabase.from('messages').update({ status: 'OUTCOME_UNKNOWN', last_error_code: 'RESULT_PERSIST_FAILED', last_error_message: null, updated_at: new Date().toISOString() }).eq('id', message.id).eq('status', 'SENDING')
      return { id: message.id, status: 'OUTCOME_UNKNOWN' as const }
    }
    if (message.sequence_id) await supabase.rpc('refresh_message_sequence_status', { p_sequence_id: message.sequence_id })
    return { id: message.id, status: 'SENT' as const, providerMessageId: accepted.providerMessageId }
  } catch (error) {
    const unknown = error instanceof OutcomeUnknownError
    await supabase.from('messages').update({ status: unknown ? 'OUTCOME_UNKNOWN' : 'FAILED', last_error_code: unknown ? 'OUTCOME_UNKNOWN' : error instanceof ProviderRejectedError ? `EVOLUTION_HTTP_${error.status}` : 'DISPATCH_FAILED', last_error_message: null, updated_at: new Date().toISOString() }).eq('id', message.id).eq('status', 'SENDING')
    return { id: message.id, status: unknown ? 'OUTCOME_UNKNOWN' as const : 'FAILED' as const }
  }
}

const messageId = process.argv[2]
if (messageId) {
  sendOneMessage(messageId).then((result) => {
    console.log(JSON.stringify(result))
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'DIRECT_MESSAGE_FAILED')
    process.exitCode = 1
  })
} else {
  console.error('Usage: npm run worker:send-one -- <message-id>')
  process.exitCode = 2
}
