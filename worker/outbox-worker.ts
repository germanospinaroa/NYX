import { createClient } from '@supabase/supabase-js'
import { EvolutionHttpAdapter } from './evolution-http-adapter'
import { OutcomeUnknownError, ProviderRejectedError, type EvolutionAdapter } from '../lib/evolution/adapter'

type OutboxMessage = { id: string; campaign_id?: string | null; sequence_id?: string | null; destination: string; message_text: string; message_type?: 'TEXT' | 'IMAGE' | 'AUDIO' | null; caption?: string | null; media_path?: string | null; media_mime_type?: string | null; media_duration_ms?: number | null; campaign_recipient_id?: string | null }

export async function processOutboxOnce(adapter = new EvolutionHttpAdapter()) {
  const supabase = createWorkerClient()
  const { data, error } = await supabase.rpc('claim_outbox_batch', { p_limit: Number(process.env.OUTBOX_BATCH_SIZE ?? 20) })
  if (error) throw new Error('OUTBOX_CLAIM_FAILED')
  const messages = (data ?? []) as OutboxMessage[]
  for (const message of messages) {
    try {
      const accepted = await dispatchMessage(supabase, adapter, message)
       const { data: persisted, error: persistError } = await supabase.from('messages').update({ status: 'SENT', provider_message_id: accepted.providerMessageId, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', message.id).eq('status', 'SENDING').select('id').maybeSingle()
       if (persistError) {
         console.error('OUTBOX_RESULT_PERSIST_FAILED', message.id)
         await supabase.from('messages').update({ status: 'OUTCOME_UNKNOWN', last_error_code: 'RESULT_PERSIST_FAILED', last_error_message: null, updated_at: new Date().toISOString() }).eq('id', message.id).eq('status', 'SENDING')
       }
       if (persisted && message.sequence_id) {
         await supabase.rpc('refresh_message_sequence_status', { p_sequence_id: message.sequence_id })
         if (message.campaign_recipient_id) await supabase.rpc('refresh_campaign_recipient_status', { p_campaign_recipient_id: message.campaign_recipient_id })
       } else if (persisted && message.campaign_recipient_id) {
         // Legacy one-message campaign rows have no sequence to reconcile.
         await supabase.from('campaign_recipients').update({ status: 'SENT' }).eq('id', message.campaign_recipient_id).eq('status', 'QUEUED')
       }
    } catch (error) {
       const unknown = error instanceof OutcomeUnknownError
       console.error('OUTBOX_DISPATCH_FAILED', { messageType: message.message_type ?? 'TEXT', errorClass: error instanceof ProviderRejectedError ? 'PROVIDER_REJECTED' : unknown ? 'OUTCOME_UNKNOWN' : 'DISPATCH_FAILED', providerHttpStatus: error instanceof ProviderRejectedError ? error.status : undefined, errorCode: error instanceof ProviderRejectedError ? `EVOLUTION_HTTP_${error.status}` : unknown ? 'OUTCOME_UNKNOWN' : sanitizedDispatchError(error) })
       const dispatchErrorCode = sanitizedDispatchError(error)
       const { data: failedPersisted } = await supabase.from('messages').update({ status: unknown ? 'OUTCOME_UNKNOWN' : 'FAILED', last_error_code: unknown ? 'OUTCOME_UNKNOWN' : dispatchErrorCode, last_error_message: null, updated_at: new Date().toISOString() }).eq('id', message.id).eq('status', 'SENDING').select('id').maybeSingle()
       if (failedPersisted && message.sequence_id) {
         await supabase.rpc('refresh_message_sequence_status', { p_sequence_id: message.sequence_id })
         if (message.campaign_recipient_id) await supabase.rpc('refresh_campaign_recipient_status', { p_campaign_recipient_id: message.campaign_recipient_id })
       } else if (failedPersisted && message.campaign_recipient_id) {
         await supabase.from('campaign_recipients').update({ status: unknown ? 'OUTCOME_UNKNOWN' : 'FAILED' }).eq('id', message.campaign_recipient_id).eq('status', 'QUEUED')
       }
    }
    if (message.campaign_id) await supabase.rpc('refresh_campaign_status', { p_campaign_id: message.campaign_id })
    await pacing()
  }
  return messages.length
}

export async function dispatchMessage(supabase: ReturnType<typeof createWorkerClient>, adapter: EvolutionAdapter, message: OutboxMessage) {
  if (message.message_type === 'AUDIO') {
    if (!message.media_path) throw new Error('MEDIA_DOWNLOAD_FAILED')
    const audio = await downloadAudioForDispatch(supabase, message.media_path, message.media_mime_type)
    return adapter.sendAudio({ instance: '', destination: message.destination, audio: audio.blob, mimeType: audio.mimeType, fileName: audio.fileName, encoding: true })
  }
  if (message.message_type === 'IMAGE') {
    if (!message.media_path) throw new Error('MEDIA_URL_FAILED')
    const mediaUrl = await resolveMediaUrl(supabase, message.media_path)
    return adapter.sendMedia({ instance: '', destination: message.destination, text: message.message_text, caption: message.caption ?? undefined, mediaUrl })
  }
  return adapter.sendText({ instance: '', destination: message.destination, text: message.message_text })
}

export async function runOutboxWorker(adapter = new EvolutionHttpAdapter()) {
  const interval = Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 2000)
  while (true) { await processOutboxOnce(adapter); await new Promise((resolve) => setTimeout(resolve, interval)) }
}

function createWorkerClient() { const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY; if (!url || !key) throw new Error('WORKER_SUPABASE_NOT_CONFIGURED'); return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }) }
async function resolveMediaUrl(supabase: ReturnType<typeof createWorkerClient>, path: string) {
  const { data, error } = await supabase.storage.from('nyx-media').createSignedUrl(path, 3600)
  if (error || !data?.signedUrl) throw new Error('MEDIA_URL_FAILED')
  return data.signedUrl
}

const AUDIO_MIME = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg'])
const MAX_AUDIO_BYTES = 16 * 1024 * 1024

export async function downloadAudioForDispatch(supabase: ReturnType<typeof createWorkerClient>, path: string, declaredMime?: string | null) {
  const { data, error } = await supabase.storage.from('nyx-media').download(path)
  if (error || !data || data.size <= 0 || data.size > MAX_AUDIO_BYTES) throw new Error('MEDIA_DOWNLOAD_FAILED')
  const mimeType = data.type || declaredMime || ''
  if (!AUDIO_MIME.has(mimeType)) throw new Error('MEDIA_DOWNLOAD_FAILED')
  return { blob: data, mimeType, fileName: audioFileName(mimeType) }
}

function audioFileName(mimeType: string) {
  return ({ 'audio/webm': 'voice.webm', 'audio/ogg': 'voice.ogg', 'audio/mp4': 'voice.m4a', 'audio/mpeg': 'voice.mp3' } as Record<string, string>)[mimeType]
}

function sanitizedDispatchError(error: unknown) {
  if (error instanceof ProviderRejectedError) return `EVOLUTION_HTTP_${error.status}`
  if (error instanceof Error && error.message === 'MEDIA_DOWNLOAD_FAILED') return 'MEDIA_DOWNLOAD_FAILED'
  if (error instanceof Error && error.message === 'MEDIA_URL_FAILED') return 'MEDIA_URL_FAILED'
  return 'DISPATCH_FAILED'
}
async function pacing() { const ms = Math.max(0, Number(process.env.OUTBOX_PACING_MS ?? 1000)); if (ms) await new Promise((resolve) => setTimeout(resolve, ms)) }
