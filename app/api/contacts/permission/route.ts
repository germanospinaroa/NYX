import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveContactIds, type SerializedContactSelection } from '@/lib/contacts/selection'
import { isSameOrigin } from '@/lib/security/request'
import { requireUser } from '@/lib/supabase/user'

const schema = z.object({ selection: z.unknown(), status: z.enum(['UNKNOWN', 'OPTED_IN', 'OPTED_OUT']), source: z.string().trim().max(120).optional() })

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 })
    const { supabase, user } = await requireUser()
    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_PERMISSION' }, { status: 422 })
    const selection = parsed.data.selection as SerializedContactSelection
    const resolved = await resolveContactIds(supabase, user.id, selection)
    if (resolved.error || !resolved.ids.length) return NextResponse.json({ error: 'EMPTY_AUDIENCE' }, { status: 422 })
    if (parsed.data.status === 'OPTED_IN' && !parsed.data.source) return NextResponse.json({ error: 'PERMISSION_SOURCE_REQUIRED' }, { status: 422 })
    const now = new Date().toISOString()
    const rows = resolved.ids.map((contactId) => ({ owner_id: user.id, contact_id: contactId, channel: 'WHATSAPP', status: parsed.data.status, consent_at: parsed.data.status === 'OPTED_IN' ? now : null, consent_source: parsed.data.status === 'OPTED_IN' ? parsed.data.source : null, opted_out_at: parsed.data.status === 'OPTED_OUT' ? now : null, updated_at: now }))
    for (let offset = 0; offset < rows.length; offset += 500) {
      const { error } = await supabase.from('contact_channel_permissions').upsert(rows.slice(offset, offset + 500), { onConflict: 'owner_id,contact_id,channel' })
      if (error) return NextResponse.json({ error: offset ? 'PERMISSION_UPDATE_PARTIAL' : 'PERMISSION_UPDATE_FAILED', updated: offset }, { status: 400 })
    }
    return NextResponse.json({ updated: resolved.ids.length })
  } catch (error) {
    const message = error instanceof Error && error.message === 'UNAUTHORIZED' ? error.message : 'PERMISSION_UPDATE_FAILED'
    return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 })
  }
}
