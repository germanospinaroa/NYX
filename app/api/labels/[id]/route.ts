import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/lib/supabase/user'
import { isSameOrigin } from '@/lib/security/request'

const schema = z.object({ name: z.string().trim().min(1).max(80), color: z.string().trim().regex(/^#[0-9a-f]{6}$/iu).nullable().optional() })

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!isSameOrigin(request)) return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 })
    const { supabase, user } = await requireUser(); const { id } = await params
    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_LABEL' }, { status: 422 })
    const { data, error } = await supabase.from('labels').update({ name: parsed.data.name, normalized_name: parsed.data.name.toLocaleLowerCase().replace(/\s+/gu, ' '), color: parsed.data.color ?? null }).eq('owner_id', user.id).eq('id', id).select('id, name, color').maybeSingle()
    if (error) return NextResponse.json({ error: error.code === '23505' ? 'LABEL_ALREADY_EXISTS' : 'LABEL_UPDATE_FAILED' }, { status: 400 })
    if (!data) return NextResponse.json({ error: 'LABEL_NOT_FOUND' }, { status: 404 })
    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error && error.message === 'UNAUTHORIZED' ? error.message : 'LABEL_UPDATE_FAILED'
    return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!isSameOrigin(request)) return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 })
    const { supabase, user } = await requireUser(); const { id } = await params
    const { count } = await supabase.from('contact_labels').select('contact_id', { count: 'exact', head: true }).eq('owner_id', user.id).eq('label_id', id)
    const { error } = await supabase.from('labels').delete().eq('owner_id', user.id).eq('id', id)
    if (error) return NextResponse.json({ error: 'LABEL_DELETE_FAILED' }, { status: 400 })
    return NextResponse.json({ deleted: true, detached: count ?? 0 })
  } catch (error) {
    const message = error instanceof Error && error.message === 'UNAUTHORIZED' ? error.message : 'LABEL_DELETE_FAILED'
    return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 })
  }
}
