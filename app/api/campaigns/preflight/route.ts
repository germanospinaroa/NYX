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
    const { data, error } = await supabase.rpc('preflight_campaign_audience', { p_contact_ids: resolved.ids, p_frequency_cap_days: parsed.data.frequencyCapDays })
    if (error) return NextResponse.json({ error: 'PREFLIGHT_FAILED' }, { status: 400 })
    return NextResponse.json({ selected: data?.selected ?? 0, permitted: data?.permitted ?? 0, unknown: data?.unknown ?? 0, optedOut: data?.opted_out ?? 0, recent: data?.recent ?? 0, eligible: data?.eligible ?? 0, samples: data?.samples ?? [] })
  } catch (error) {
    const message = error instanceof Error && error.message === 'UNAUTHORIZED' ? error.message : 'PREFLIGHT_FAILED'
    return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 })
  }
}
