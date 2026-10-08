import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveContactIds, type SerializedContactSelection } from '@/lib/contacts/selection'
import { requireUser } from '@/lib/supabase/user'
import { isSameOrigin } from '@/lib/security/request'

const mediaSchema = z.string().trim().url().refine((value) => value.startsWith('https://'), 'MEDIA_MUST_USE_HTTPS').optional()
const schema = z.object({ name: z.string().trim().max(120).optional(), neutralMessage: z.string().trim().min(1).max(10000), maleMessage: z.string().trim().max(10000).optional(), femaleMessage: z.string().trim().max(10000).optional(), mediaPath: mediaSchema, selection: z.union([z.object({ mode: z.literal('ids'), contactIds: z.array(z.string().uuid()).min(1).max(100000) }), z.object({ mode: z.literal('filter'), q: z.string().max(100).optional(), gender: z.enum(['', 'MALE', 'FEMALE', 'UNKNOWN']).optional(), labelId: z.string().uuid().optional(), archived: z.enum(['ACTIVE', 'ARCHIVED', 'ALL']).optional(), excludeIds: z.array(z.string().uuid()).max(100000).optional() })]) })

export async function GET() {
  try { const { supabase, user } = await requireUser(); const { data, error } = await supabase.from('campaigns').select('id, name, status, created_at, scheduled_at, campaign_recipients(status), messages(status)').eq('owner_id', user.id).order('created_at', { ascending: false }); if (error) return NextResponse.json({ error: 'CAMPAIGNS_LOAD_FAILED' }, { status: 400 }); return NextResponse.json({ campaigns: data ?? [] }) } catch (error) { const message = error instanceof Error && error.message === 'UNAUTHORIZED' ? error.message : 'CAMPAIGNS_LOAD_FAILED'; return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 }) }
}

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 })
    const { supabase, user } = await requireUser(); const parsed = schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: 'INVALID_CAMPAIGN' }, { status: 422 })
    const resolved = await resolveContactIds(supabase, user.id, parsed.data.selection as SerializedContactSelection); if (resolved.error || !resolved.ids.length) return NextResponse.json({ error: 'EMPTY_AUDIENCE' }, { status: 422 })
    const { data: campaign, error } = await supabase.from('campaigns').insert({ owner_id: user.id, name: parsed.data.name?.trim() || null, status: 'DRAFT', neutral_message: parsed.data.neutralMessage, male_message: parsed.data.maleMessage?.trim() || null, female_message: parsed.data.femaleMessage?.trim() || null, media_path: parsed.data.mediaPath ?? null }).select('id').single()
    if (error || !campaign) return NextResponse.json({ error: 'CAMPAIGN_CREATE_FAILED' }, { status: 400 })
    const snapshot = await supabase.rpc('create_campaign_snapshot', { p_campaign_id: campaign.id, p_contact_ids: resolved.ids })
    if (snapshot.error) return NextResponse.json({ error: 'CAMPAIGN_SNAPSHOT_FAILED' }, { status: 400 })
    return NextResponse.json({ campaign: { id: campaign.id, status: 'READY' }, recipients: snapshot.data }, { status: 201 })
  } catch (error) { const message = error instanceof Error && error.message === 'UNAUTHORIZED' ? error.message : 'CAMPAIGN_CREATE_FAILED'; return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 }) }
}
