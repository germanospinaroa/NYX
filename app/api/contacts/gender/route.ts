import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/lib/supabase/user'
import { isSameOrigin } from '@/lib/security/request'

const schema = z.object({ contactIds: z.array(z.string().uuid()).min(1).max(1000), gender: z.enum(['MALE', 'FEMALE', 'UNKNOWN']) })

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 })
    const { supabase } = await requireUser()
    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_GENDER_ACTION' }, { status: 422 })
    const { data, error } = await supabase.rpc('bulk_update_contact_gender', { p_contact_ids: parsed.data.contactIds, p_gender: parsed.data.gender })
    if (error) return NextResponse.json({ error: 'GENDER_ACTION_FAILED' }, { status: 400 })
    return NextResponse.json({ updated: data })
  } catch (error) {
    const message = error instanceof Error && error.message === 'UNAUTHORIZED' ? error.message : 'GENDER_ACTION_FAILED'
    return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 })
  }
}
