import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/lib/supabase/user'
import { isSameOrigin } from '@/lib/security/request'
import { publicFailureReason } from '@/lib/campaigns/monitor'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, user } = await requireUser()
    const { id } = await params
    if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'CAMPAIGN_NOT_FOUND' }, { status: 404 })
    const { data: campaign, error: campaignError } = await supabase.from('campaigns').select('id, name, status, created_at, started_at, completed_at, scheduled_at').eq('id', id).eq('owner_id', user.id).maybeSingle()
    if (campaignError || !campaign) return NextResponse.json({ error: 'CAMPAIGN_NOT_FOUND' }, { status: 404 })
    const { data: recipients, error: recipientError } = await supabase.from('campaign_recipients').select('id, status, contact_id, content_variant_key, messages(id, sequence_index, message_type, status, attempt_count, last_error_code, created_at, claimed_at, sent_at, sequence_id), contacts(display_name)').eq('campaign_id', id).eq('owner_id', user.id).order('created_at', { ascending: true })
    if (recipientError) return NextResponse.json({ error: 'CAMPAIGN_DETAIL_FAILED' }, { status: 400 })
    const { data: stepRows, error: stepsError } = await supabase.from('campaign_sequence_steps').select('sequence_index, content_variant_key').eq('campaign_id', id).eq('owner_id', user.id)
    if (stepsError) return NextResponse.json({ error: 'CAMPAIGN_DETAIL_FAILED' }, { status: 400 })
    const safeRecipients = (recipients ?? []).map((recipient) => {
      const messages = [...(recipient.messages ?? [])].sort((a, b) => (a.sequence_index ?? 0) - (b.sequence_index ?? 0))
      return {
        id: recipient.id,
        contactId: recipient.contact_id,
        contentVariantKey: recipient.content_variant_key ?? 'A',
        contactName: recipient.contacts?.[0]?.display_name ?? 'Contacto',
        status: recipient.status,
        steps: messages.map((message, index) => ({
          index: message.sequence_index ?? index,
          type: message.message_type,
          status: message.status,
          attemptCount: message.attempt_count,
          createdAt: message.created_at,
          claimedAt: message.claimed_at,
          sentAt: message.sent_at,
          failureReason: publicFailureReason(message.last_error_code),
          cancelledByPreviousFailure: message.status === 'CANCELLED' && messages.slice(0, index).some((previous) => previous.status === 'FAILED' || previous.status === 'OUTCOME_UNKNOWN'),
        })),
      }
    })
    const allMessages = safeRecipients.flatMap((recipient) => recipient.steps)
    const sentRecipients = safeRecipients.filter((recipient) => recipient.status === 'SENT').length
    const terminalMessages = allMessages.filter((message) => ['SENT', 'FAILED', 'OUTCOME_UNKNOWN', 'CANCELLED'].includes(message.status)).length
    const totalSteps = new Set((stepRows ?? []).map((step) => step.sequence_index)).size
    const variantKeys = [...new Set(safeRecipients.map((recipient) => recipient.contentVariantKey))]
    const variantSummaries = variantKeys.map((key) => { const assigned = safeRecipients.filter((recipient) => recipient.contentVariantKey === key); return { key, recipients: assigned.length, completed: assigned.filter((recipient) => recipient.status === 'SENT').length, failed: assigned.filter((recipient) => recipient.status === 'FAILED').length, unknown: assigned.filter((recipient) => recipient.status === 'OUTCOME_UNKNOWN').length, pending: assigned.filter((recipient) => !['SENT', 'FAILED', 'OUTCOME_UNKNOWN', 'CANCELLED'].includes(recipient.status)).length, sentMessages: assigned.flatMap((recipient) => recipient.steps).filter((step) => step.status === 'SENT').length } })
    return NextResponse.json({ campaign: { ...campaign, totalRecipients: safeRecipients.length, sentRecipients, failedRecipients: safeRecipients.filter((item) => item.status === 'FAILED').length, unknownRecipients: safeRecipients.filter((item) => item.status === 'OUTCOME_UNKNOWN').length, pendingRecipients: safeRecipients.filter((item) => !['SENT', 'FAILED', 'OUTCOME_UNKNOWN', 'CANCELLED'].includes(item.status)).length, totalSteps, totalMessages: allMessages.length, processedMessages: terminalMessages, variantSummaries, recipients: safeRecipients } })
  } catch (error) {
    const message = error instanceof Error && error.message === 'UNAUTHORIZED' ? error.message : 'CAMPAIGN_DETAIL_FAILED'
    return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 })
  }
}

const schema = z.object({ action: z.enum(['START', 'PAUSE', 'RESUME', 'CANCEL', 'SCHEDULE']), scheduledAt: z.string().datetime().optional() })
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { if (!isSameOrigin(request)) return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 }); const { supabase } = await requireUser(); const { id } = await params; const parsed = schema.safeParse(await request.json()); if (!parsed.success || (parsed.data.action === 'SCHEDULE' && !parsed.data.scheduledAt)) return NextResponse.json({ error: 'INVALID_CAMPAIGN_ACTION' }, { status: 422 }); const rpc = parsed.data.action === 'START' ? 'queue_campaign' : parsed.data.action === 'PAUSE' ? 'pause_campaign' : parsed.data.action === 'RESUME' ? 'resume_campaign' : parsed.data.action === 'SCHEDULE' ? 'schedule_campaign' : 'cancel_campaign'; const rpcArgs = parsed.data.action === 'SCHEDULE' ? { p_campaign_id: id, p_scheduled_at: parsed.data.scheduledAt } : { p_campaign_id: id }; const { data, error } = await supabase.rpc(rpc, rpcArgs); if (error) return NextResponse.json({ error: 'CAMPAIGN_UPDATE_FAILED' }, { status: 400 }); if (!data) return NextResponse.json({ error: 'CAMPAIGN_NOT_FOUND' }, { status: 404 }); const status = parsed.data.action === 'START' || parsed.data.action === 'RESUME' ? 'QUEUED' : parsed.data.action === 'PAUSE' ? 'PAUSED' : parsed.data.action === 'SCHEDULE' ? 'SCHEDULED' : 'CANCELLED'; return NextResponse.json({ id, status, scheduledAt: parsed.data.scheduledAt ?? null }) } catch (error) { const message = error instanceof Error && error.message === 'UNAUTHORIZED' ? error.message : 'CAMPAIGN_UPDATE_FAILED'; return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 }) }
}
