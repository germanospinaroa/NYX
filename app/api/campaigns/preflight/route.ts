import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveContactIds, type SerializedContactSelection } from '@/lib/contacts/selection'
import { requireUser } from '@/lib/supabase/user'
import { isSameOrigin } from '@/lib/security/request'

const schema = z.object({ selection: z.unknown(), frequencyCapDays: z.number().int().min(1).max(90).default(7) })

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 })
    const { supabase, user } = await requireUser(); const parsed = schema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_PREFLIGHT' }, { status: 422 })
    const resolved = await resolveContactIds(supabase, user.id, parsed.data.selection as SerializedContactSelection)
    if (resolved.error) return NextResponse.json({ error: 'PREFLIGHT_FAILED' }, { status: 400 })
    const [permissions, recent] = await Promise.all([
      supabase.from('contact_channel_permissions').select('contact_id, status').eq('owner_id', user.id).eq('channel', 'WHATSAPP').in('contact_id', resolved.ids),
      supabase.from('messages').select('contact_id').eq('owner_id', user.id).not('campaign_id', 'is', null).eq('status', 'SENT').gte('sent_at', new Date(Date.now() - parsed.data.frequencyCapDays * 86400000).toISOString()).in('contact_id', resolved.ids),
    ])
    if (permissions.error || recent.error) return NextResponse.json({ error: 'PREFLIGHT_FAILED' }, { status: 400 })
    const permissionMap = new Map((permissions.data ?? []).map((row) => [row.contact_id, row.status]))
    const recentIds = new Set((recent.data ?? []).map((row) => row.contact_id))
    const withPermission = resolved.ids.filter((id) => permissionMap.get(id) === 'OPTED_IN')
    const optedOut = resolved.ids.filter((id) => permissionMap.get(id) === 'OPTED_OUT')
    const unknown = resolved.ids.filter((id) => !permissionMap.has(id) || permissionMap.get(id) === 'UNKNOWN')
    const eligible = withPermission.filter((id) => !recentIds.has(id))
    const { data: samples, error: samplesError } = await supabase.from('contacts').select('id, first_name, display_name').eq('owner_id', user.id).in('id', eligible.slice(0, 5))
    if (samplesError) return NextResponse.json({ error: 'PREFLIGHT_FAILED' }, { status: 400 })
    return NextResponse.json({ selected: resolved.ids.length, permitted: withPermission.length, unknown: unknown.length, optedOut: optedOut.length, recent: withPermission.filter((id) => recentIds.has(id)).length, eligible: eligible.length, samples: samples ?? [] })
  } catch (error) {
    const message = error instanceof Error && error.message === 'UNAUTHORIZED' ? error.message : 'PREFLIGHT_FAILED'
    return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 })
  }
}
