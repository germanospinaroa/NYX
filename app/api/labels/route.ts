import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/lib/supabase/user'
import { isSameOrigin } from '@/lib/security/request'

const schema = z.object({ name: z.string().trim().min(1).max(80), color: z.string().trim().regex(/^#[0-9a-f]{6}$/iu).optional() })

export async function GET() {
  try {
    const { supabase, user } = await requireUser()
    const { data, error } = await supabase.from('labels').select('id, name, color, normalized_name, contact_labels(count)').eq('owner_id', user.id).order('name')
    if (error) return NextResponse.json({ error: 'LABELS_LOAD_FAILED' }, { status: 400 })
    return NextResponse.json({ labels: data ?? [] })
  } catch (error) {
    const message = error instanceof Error && error.message === 'UNAUTHORIZED' ? error.message : 'LABELS_LOAD_FAILED'
    return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 })
  }
}

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 })
    const { supabase, user } = await requireUser()
    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_LABEL' }, { status: 422 })
    const { data, error } = await supabase.from('labels').insert({ owner_id: user.id, name: parsed.data.name, normalized_name: parsed.data.name.toLocaleLowerCase().replace(/\s+/gu, ' '), color: parsed.data.color ?? null }).select('id, name, color').single()
    if (error) return NextResponse.json({ error: error.code === '23505' ? 'LABEL_ALREADY_EXISTS' : 'LABEL_CREATE_FAILED' }, { status: 400 })
    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    const message = error instanceof Error && error.message === 'UNAUTHORIZED' ? error.message : 'LABEL_CREATE_FAILED'
    return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 })
  }
}
