import { createClient } from '@supabase/supabase-js'
import { EvolutionHttpAdapter } from './evolution-http-adapter'
import { OutcomeUnknownError } from '../lib/evolution/adapter'

type OutboxMessage = { id: string; campaign_id?: string | null; sequence_id?: string | null; destination: string; message_text: string; message_type?: 'TEXT' | 'IMAGE' | null; caption?: string | null; media_path?: string | null; campaign_recipient_id?: string | null }

export async function processOutboxOnce(adapter = new EvolutionHttpAdapter()) {
  const supabase = createWorkerClient()
  const { data, error } = await supabase.rpc('claim_outbox_batch', { p_limit: Number(process.env.OUTBOX_BATCH_SIZE ?? 20) })
  if (error) throw new Error('OUTBOX_CLAIM_FAILED')
  const messages = (data ?? []) as OutboxMessage[]
  for (const message of messages) {
    try {
      const mediaUrl = message.media_path ? await resolveMediaUrl(supabase, message.media_path) : null
      const accepted = message.media_path ? await adapter.sendMedia({ instance: '', destination: message.destination, text: message.message_text, caption: message.caption ?? undefined, mediaUrl: mediaUrl ?? '' }) : await adapter.sendText({ instance: '', destination: message.destination, text: message.message_text })
       const { data: persisted, error: persistError } = await supabase.from('messages').update({ status: 'SENT', provider_message_id: accepted.providerMessageId, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', message.id).eq('status', 'SENDING').select('id').maybeSingle()
       if (persistError) {
         console.error('OUTBOX_RESULT_PERSIST_FAILED', message.id)
         await supabase.from('messages').update({ status: 'OUTCOME_UNKNOWN', last_error_code: 'RESULT_PERSIST_FAILED', last_error_message: null, updated_at: new Date().toISOString() }).eq('id', message.id).eq('status', 'SENDING')
       }
       if (persisted && message.campaign_recipient_id) await supabase.from('campaign_recipients').update({ status: 'SENT' }).eq('id', message.campaign_recipient_id).eq('status', 'QUEUED')
       if (persisted && message.sequence_id) await supabase.rpc('refresh_message_sequence_status', { p_sequence_id: message.sequence_id })
    } catch (error) {
      const unknown = error instanceof OutcomeUnknownError
       const { data: failedPersisted } = await supabase.from('messages').update({ status: unknown ? 'OUTCOME_UNKNOWN' : 'FAILED', last_error_code: unknown ? 'OUTCOME_UNKNOWN' : 'PROVIDER_FAILED', last_error_message: unknown ? null : 'Provider rejected dispatch', updated_at: new Date().toISOString() }).eq('id', message.id).eq('status', 'SENDING').select('id').maybeSingle()
       if (failedPersisted && message.campaign_recipient_id) await supabase.from('campaign_recipients').update({ status: unknown ? 'OUTCOME_UNKNOWN' : 'FAILED' }).eq('id', message.campaign_recipient_id).eq('status', 'QUEUED')
       if (failedPersisted && message.sequence_id) await supabase.rpc('refresh_message_sequence_status', { p_sequence_id: message.sequence_id })
    }
    if (message.campaign_id) await supabase.rpc('refresh_campaign_status', { p_campaign_id: message.campaign_id })
    await pacing()
  }
  return messages.length
}

export async function runOutboxWorker(adapter = new EvolutionHttpAdapter()) {
  const interval = Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 2000)
  while (true) { await processOutboxOnce(adapter); await new Promise((resolve) => setTimeout(resolve, interval)) }
}

function createWorkerClient() { const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY; if (!url || !key) throw new Error('WORKER_SUPABASE_NOT_CONFIGURED'); return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }) }
async function resolveMediaUrl(supabase: ReturnType<typeof createWorkerClient>, path: string) {
  if (path.startsWith('https://')) return path
  const { data, error } = await supabase.storage.from('nyx-media').createSignedUrl(path, 3600)
  if (error || !data?.signedUrl) throw new Error('MEDIA_URL_FAILED')
  return data.signedUrl
}
async function pacing() { const ms = Math.max(0, Number(process.env.OUTBOX_PACING_MS ?? 1000)); if (ms) await new Promise((resolve) => setTimeout(resolve, ms)) }
