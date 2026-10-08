import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveContactIds, type SerializedContactSelection } from '@/lib/contacts/selection'
import { requireUser } from '@/lib/supabase/user'
import { isSameOrigin } from '@/lib/security/request'

const selectionSchema = z.union([
  z.object({ mode: z.literal('ids'), contactIds: z.array(z.string().uuid()).min(1).max(100000) }),
  z.object({ mode: z.literal('filter'), q: z.string().max(100).optional(), gender: z.enum(['', 'MALE', 'FEMALE', 'UNKNOWN']).optional(), labelId: z.string().uuid().optional(), archived: z.enum(['ACTIVE', 'ARCHIVED', 'ALL']).optional(), excludeIds: z.array(z.string().uuid()).max(100000).optional() }),
])
const schema = z.object({ selection: selectionSchema, labelId: z.string().uuid(), action: z.enum(['ADD', 'REMOVE']) })

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 })
    const { supabase, user } = await requireUser()
    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_LABEL_ACTION' }, { status: 422 })
    const resolved = await resolveContactIds(supabase, user.id, parsed.data.selection as SerializedContactSelection)
    if (resolved.error) return NextResponse.json({ error: 'CONTACT_SELECTION_FAILED' }, { status: 400 })
    if (resolved.ids.length === 0) return NextResponse.json({ updated: 0 })
    const { data, error } = await supabase.rpc('bulk_set_contact_label', { p_label_id: parsed.data.labelId, p_contact_ids: resolved.ids, p_action: parsed.data.action })
    if (error) return NextResponse.json({ error: 'LABEL_ACTION_FAILED' }, { status: 400 })
    return NextResponse.json({ updated: data })
  } catch (error) {
    const message = error instanceof Error && error.message === 'UNAUTHORIZED' ? error.message : 'LABEL_ACTION_FAILED'
    return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 })
  }
}
