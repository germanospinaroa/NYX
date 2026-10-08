import { NextResponse } from 'next/server'
import { z } from 'zod'
import { normalizePhone } from '@/lib/phone/normalize'
import { requireUser } from '@/lib/supabase/user'
import { isSameOrigin } from '@/lib/security/request'

const updateSchema = z.object({ name: z.string().trim().min(1).max(200), phone: z.string().trim().min(1).max(40), gender: z.enum(['MALE', 'FEMALE', 'UNKNOWN']), notes: z.string().trim().max(5000).nullable().optional(), archived: z.boolean().optional() })

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, user } = await requireUser(); const { id } = await params
    const [contactResult, messagesResult] = await Promise.all([
      supabase.from('contacts').select('id, display_name, first_name, phone_e164, gender, gender_reviewed, notes, archived_at, contact_labels(label_id, labels(id, name, color))').eq('owner_id', user.id).eq('id', id).maybeSingle(),
      supabase.from('messages').select('id, created_at, message_text, media_path, status, channel').eq('owner_id', user.id).eq('contact_id', id).order('created_at', { ascending: false }).limit(50),
    ])
    if (contactResult.error || !contactResult.data) return NextResponse.json({ error: 'CONTACT_NOT_FOUND' }, { status: 404 })
    return NextResponse.json({ contact: contactResult.data, messages: messagesResult.data ?? [] })
  } catch (error) {
    const message = error instanceof Error && error.message === 'UNAUTHORIZED' ? error.message : 'CONTACT_LOAD_FAILED'
    return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 })
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!isSameOrigin(request)) return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 })
    const { supabase, user } = await requireUser(); const { id } = await params
    const parsed = updateSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_CONTACT' }, { status: 422 })
    const normalized = normalizePhone(parsed.data.phone, process.env.DEFAULT_PHONE_REGION ?? 'CO')
    if ('errorCode' in normalized) return NextResponse.json({ error: 'INVALID_PHONE' }, { status: 422 })
    const update = { display_name: parsed.data.name.trim(), first_name: parsed.data.name.trim().split(/\s+/u)[0], phone_e164: normalized.e164, phone_country: normalized.country ?? null, gender: parsed.data.gender, gender_reviewed: true, notes: parsed.data.notes?.trim() || null, ...(parsed.data.archived === undefined ? {} : { archived_at: parsed.data.archived ? new Date().toISOString() : null }) }
    const { data, error } = await supabase.from('contacts').update(update).eq('owner_id', user.id).eq('id', id).select('id, display_name, first_name, phone_e164, gender, notes, archived_at').maybeSingle()
    if (error) return NextResponse.json({ error: error.code === '23505' ? 'CONTACT_ALREADY_EXISTS' : 'CONTACT_UPDATE_FAILED' }, { status: error.code === '23505' ? 409 : 400 })
    if (!data) return NextResponse.json({ error: 'CONTACT_NOT_FOUND' }, { status: 404 })
    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error && error.message === 'UNAUTHORIZED' ? error.message : 'CONTACT_UPDATE_FAILED'
    return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!isSameOrigin(request)) return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 })
    const { supabase, user } = await requireUser(); const { id } = await params
    const { error } = await supabase.from('contacts').delete().eq('owner_id', user.id).eq('id', id)
    if (error) return NextResponse.json({ error: 'CONTACT_DELETE_FAILED' }, { status: 400 })
    return NextResponse.json({ deleted: true })
  } catch (error) {
    const message = error instanceof Error && error.message === 'UNAUTHORIZED' ? error.message : 'CONTACT_DELETE_FAILED'
    return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 })
  }
}
