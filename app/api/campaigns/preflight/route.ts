import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveContactIds, type SerializedContactSelection } from '@/lib/contacts/selection'
import { requireUser } from '@/lib/supabase/user'
import { isSameOrigin } from '@/lib/security/request'
import type { GenderCoverage } from '@/lib/campaigns/coverage'

const schema = z.object({ selection: z.unknown() })

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 })
    const { supabase, user } = await requireUser(); const parsed = schema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_PREFLIGHT' }, { status: 422 })
    const resolved = await resolveContactIds(supabase, user.id, parsed.data.selection as SerializedContactSelection)
    if (resolved.error) return NextResponse.json({ error: 'PREFLIGHT_FAILED' }, { status: 400 })
    const { data, error } = await supabase.rpc('preflight_campaign_audience', { p_contact_ids: resolved.ids, p_frequency_cap_days: 7 })
    if (error) return NextResponse.json({ error: 'PREFLIGHT_FAILED' }, { status: 400 })
    const { data: contacts, error: contactsError } = await supabase.from('contacts').select('gender').eq('owner_id', user.id).in('id', resolved.ids).is('archived_at', null)
    if (contactsError) return NextResponse.json({ error: 'PREFLIGHT_FAILED' }, { status: 400 })
    const genderCounts = (contacts ?? []).reduce<GenderCoverage>((counts, contact) => { const gender: keyof GenderCoverage = contact.gender === 'MALE' || contact.gender === 'FEMALE' ? contact.gender : 'UNKNOWN'; counts[gender] += 1; return counts }, { MALE: 0, FEMALE: 0, UNKNOWN: 0 })
    return NextResponse.json({ selected: data?.selected ?? 0, eligible: data?.eligible ?? 0, samples: data?.samples ?? [], genderCounts })
  } catch (error) {
    const message = error instanceof Error && error.message === 'UNAUTHORIZED' ? error.message : 'PREFLIGHT_FAILED'
    return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 })
  }
}
