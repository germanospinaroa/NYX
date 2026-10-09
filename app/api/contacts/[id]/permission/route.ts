import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isSameOrigin } from '@/lib/security/request'
import { requireUser } from '@/lib/supabase/user'

const schema = z.object({ status: z.enum(['UNKNOWN', 'OPTED_IN', 'OPTED_OUT']), source: z.string().trim().max(120).optional() })

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!isSameOrigin(request)) return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 })
    const { supabase, user } = await requireUser(); const { id } = await params
    const parsed = schema.safeParse(await request.json())
    if (!parsed.success || (parsed.data.status === 'OPTED_IN' && !parsed.data.source)) return NextResponse.json({ error: 'INVALID_PERMISSION' }, { status: 422 })
    const now = new Date().toISOString()
    const { data, error } = await supabase.from('contact_channel_permissions').upsert({ owner_id: user.id, contact_id: id, channel: 'WHATSAPP', status: parsed.data.status, consent_at: parsed.data.status === 'OPTED_IN' ? now : null, consent_source: parsed.data.status === 'OPTED_IN' ? parsed.data.source : null, opted_out_at: parsed.data.status === 'OPTED_OUT' ? now : null, updated_at: now }, { onConflict: 'owner_id,contact_id,channel' }).select('status, consent_at, consent_source, opted_out_at').single()
    if (error) return NextResponse.json({ error: 'PERMISSION_UPDATE_FAILED' }, { status: 400 })
    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error && error.message === 'UNAUTHORIZED' ? error.message : 'PERMISSION_UPDATE_FAILED'
    return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 })
  }
}
