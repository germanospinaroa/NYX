import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveContactIds, type SerializedContactSelection } from '@/lib/contacts/selection'
import { requireUser } from '@/lib/supabase/user'
import { isSameOrigin } from '@/lib/security/request'
import { summarizeCampaign } from '@/lib/campaigns/monitor'

const textStep = z.object({ type: z.literal('TEXT'), neutralText: z.string().trim().min(1).max(10000), maleText: z.string().trim().max(10000).optional(), femaleText: z.string().trim().max(10000).optional(), neutralCaption: z.string().max(10000).optional(), maleCaption: z.string().max(10000).optional(), femaleCaption: z.string().max(10000).optional(), mediaPath: z.undefined().optional() })
const imageStep = z.object({ type: z.literal('IMAGE'), neutralText: z.string().max(1).optional(), maleText: z.string().max(10000).optional(), femaleText: z.string().max(10000).optional(), neutralCaption: z.string().max(10000).optional(), maleCaption: z.string().max(10000).optional(), femaleCaption: z.string().max(10000).optional(), mediaPath: z.string().trim().min(1).max(500) })
const audioStep = z.object({ type: z.literal('AUDIO'), neutralText: z.string().max(1).optional(), maleText: z.string().max(1).optional(), femaleText: z.string().max(1).optional(), neutralCaption: z.string().max(1).optional(), maleCaption: z.string().max(1).optional(), femaleCaption: z.string().max(1).optional(), mediaPath: z.string().trim().min(1).max(500), mimeType: z.enum(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg']), durationMs: z.number().int().min(1).max(3600000).optional() })
const selectionSchema = z.union([z.object({ mode: z.literal('ids'), contactIds: z.array(z.string().uuid()).min(1).max(100000) }), z.object({ mode: z.literal('filter'), q: z.string().max(100).optional(), gender: z.enum(['', 'MALE', 'FEMALE', 'UNKNOWN']).optional(), labelId: z.string().uuid().optional(), archived: z.enum(['ACTIVE', 'ARCHIVED', 'ALL']).optional(), permission: z.enum(['', 'OPTED_IN', 'OPTED_OUT', 'UNKNOWN']).optional(), excludeIds: z.array(z.string().uuid()).max(100000).optional() })])
const schema = z.object({ name: z.string().trim().max(120).optional(), frequencyCapDays: z.number().int().min(1).max(90).default(7), steps: z.array(z.discriminatedUnion('type', [textStep, imageStep, audioStep])).min(1).max(50), selection: selectionSchema })

export async function GET() {
  try {
    const { supabase, user } = await requireUser()
    const { data, error } = await supabase.from('campaigns').select('id, name, status, created_at, started_at, completed_at, scheduled_at, frequency_cap_days, campaign_recipients(status), messages(status)').eq('owner_id', user.id).order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: 'CAMPAIGNS_LOAD_FAILED' }, { status: 400 })
    return NextResponse.json({ campaigns: (data ?? []).map((campaign) => summarizeCampaign(campaign)) })
  } catch (error) {
    const message = error instanceof Error && error.message === 'UNAUTHORIZED' ? error.message : 'CAMPAIGNS_LOAD_FAILED'
    return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 })
  }
}

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 })
    const { supabase, user } = await requireUser()
    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_CAMPAIGN' }, { status: 422 })
    const resolved = await resolveContactIds(supabase, user.id, parsed.data.selection as SerializedContactSelection)
    if (resolved.error || !resolved.ids.length) return NextResponse.json({ error: 'EMPTY_AUDIENCE' }, { status: 422 })
    const { data, error } = await supabase.rpc('create_campaign_with_snapshot', { p_name: parsed.data.name?.trim() || null, p_steps: parsed.data.steps, p_contact_ids: resolved.ids, p_frequency_cap_days: parsed.data.frequencyCapDays })
    if (error) {
      console.error('CAMPAIGN_SNAPSHOT_FAILED', { code: error.code ?? 'UNKNOWN' })
      const known = error.message.includes('VARIABLE_NO_COMPATIBLE') ? 'VARIABLE_NO_COMPATIBLE' : error.message.includes('MISSING_RECIPIENT_NAME') ? 'MISSING_RECIPIENT_NAME' : error.message.includes('NO_ELIGIBLE_RECIPIENTS') ? 'NO_ELIGIBLE_RECIPIENTS' : 'CAMPAIGN_SNAPSHOT_FAILED'
      return NextResponse.json({ error: known }, { status: 400 })
    }
    return NextResponse.json({ campaign: data }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error && error.message === 'UNAUTHORIZED' ? error.message : 'CAMPAIGN_CREATE_FAILED'
    if (message !== 'UNAUTHORIZED') console.error('CAMPAIGN_ROUTE_FAILED', { code: error instanceof Error ? error.name : 'UNKNOWN' })
    return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 })
  }
}
