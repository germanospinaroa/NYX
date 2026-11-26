import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/lib/supabase/user'
import { isSameOrigin } from '@/lib/security/request'

const stepSchema = z.object({ type: z.enum(['TEXT', 'IMAGE', 'AUDIO']), neutralText: z.string().optional(), maleText: z.string().optional(), femaleText: z.string().optional(), neutralCaption: z.string().optional(), maleCaption: z.string().optional(), femaleCaption: z.string().optional(), mediaPath: z.string().optional(), mimeType: z.string().optional(), durationMs: z.number().int().nonnegative().optional() })
const variantSchema = z.object({ key: z.enum(['A', 'B', 'C', 'D', 'E']), steps: z.array(stepSchema).min(1).max(50) })
const schema = z.object({ name: z.string().max(200).nullable().optional(), variants: z.array(variantSchema).min(1).max(5), selection: z.object({ mode: z.enum(['ids']), contactIds: z.array(z.string().uuid()).min(1).max(100000) }) })

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, user } = await requireUser()
    const { id } = await params
    const { data: campaign } = await supabase.from('campaigns').select('id, name, status').eq('id', id).eq('owner_id', user.id).maybeSingle()
    if (!campaign || campaign.status !== 'READY') return NextResponse.json({ error: campaign ? 'CAMPAIGN_EDIT_CLOSED' : 'CAMPAIGN_NOT_FOUND' }, { status: campaign ? 409 : 404 })
    const [{ data: recipients, error: recipientsError }, { data: steps, error: stepsError }] = await Promise.all([
      supabase.from('campaign_recipients').select('contact_id').eq('campaign_id', id).eq('owner_id', user.id),
      supabase.from('campaign_sequence_steps').select('content_variant_key, sequence_index, message_type, neutral_text, male_text, female_text, neutral_caption, male_caption, female_caption, media_path, media_mime_type, media_duration_ms').eq('campaign_id', id).eq('owner_id', user.id).order('content_variant_key').order('sequence_index'),
    ])
    if (recipientsError || stepsError) return NextResponse.json({ error: 'CAMPAIGN_EDIT_LOAD_FAILED' }, { status: 400 })
    const keys = [...new Set((steps ?? []).map((step) => step.content_variant_key))]
    const variants = keys.map((key) => ({ key, steps: (steps ?? []).filter((step) => step.content_variant_key === key).map((step) => ({ type: step.message_type, neutralText: step.neutral_text ?? '', maleText: step.male_text ?? '', femaleText: step.female_text ?? '', neutralCaption: step.neutral_caption ?? '', maleCaption: step.male_caption ?? '', femaleCaption: step.female_caption ?? '', mediaPath: step.media_path ?? undefined, mimeType: step.media_mime_type ?? undefined, durationMs: step.media_duration_ms ?? undefined })) }))
    return NextResponse.json({ id, name: campaign.name, selection: { mode: 'ids', contactIds: (recipients ?? []).map((row) => row.contact_id) }, variants })
  } catch (error) {
    const unauthorized = error instanceof Error && error.message === 'UNAUTHORIZED'
    return NextResponse.json({ error: unauthorized ? 'UNAUTHORIZED' : 'CAMPAIGN_EDIT_LOAD_FAILED' }, { status: unauthorized ? 401 : 400 })
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!isSameOrigin(request)) return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 })
    const { supabase } = await requireUser()
    const { id } = await params
    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_CAMPAIGN' }, { status: 422 })
    const { data, error } = await supabase.rpc('update_campaign_with_variants', { p_campaign_id: id, p_name: parsed.data.name ?? null, p_variants: parsed.data.variants, p_contact_ids: parsed.data.selection.contactIds })
    if (error) {
      const code = error.message.includes('CAMPAIGN_EDIT_CLOSED') ? 'CAMPAIGN_EDIT_CLOSED' : error.message.includes('MISSING_MESSAGE_FOR_GENDER') ? 'MISSING_MESSAGE_FOR_GENDER' : error.message.includes('VARIANT_STEP_COUNT_MISMATCH') ? 'VARIANT_STEP_COUNT_MISMATCH' : error.message.includes('VARIANT_STEP_TYPE_MISMATCH') ? 'VARIANT_STEP_TYPE_MISMATCH' : error.message.includes('INVALID_AUDIO_MIME') ? 'INVALID_AUDIO_MIME' : 'CAMPAIGN_UPDATE_FAILED'
      return NextResponse.json({ error: code }, { status: code === 'CAMPAIGN_EDIT_CLOSED' ? 409 : 400 })
    }
    return NextResponse.json({ campaign: data })
  } catch (error) {
    const unauthorized = error instanceof Error && error.message === 'UNAUTHORIZED'
    return NextResponse.json({ error: unauthorized ? 'UNAUTHORIZED' : 'CAMPAIGN_UPDATE_FAILED' }, { status: unauthorized ? 401 : 400 })
  }
}
