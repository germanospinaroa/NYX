import { NextResponse } from 'next/server'
import { z } from 'zod'
import { normalizePhone } from '@/lib/phone/normalize'
import { requireUser } from '@/lib/supabase/user'
import { isSameOrigin } from '@/lib/security/request'

function escapeLike(value: string) { return value.replace(/[\\%_,().]/gu, (char) => `\\${char}`) }
const createSchema = z.object({ name: z.string().trim().min(1).max(200), phone: z.string().trim().min(1).max(40), gender: z.enum(['MALE', 'FEMALE', 'UNKNOWN']).default('UNKNOWN'), labelIds: z.array(z.string().uuid()).max(50).default([]), notes: z.string().trim().max(5000).optional() })

export async function GET(request: Request) {
  try {
    const { supabase } = await requireUser()
    const url = new URL(request.url)
    const page = Math.max(Number(url.searchParams.get('page') ?? 0) || 0, 0)
    const pageSize = Math.min(Math.max(Number(url.searchParams.get('pageSize') ?? 50) || 50, 1), 100)
    const query = escapeLike((url.searchParams.get('q') ?? '').trim().slice(0, 100))
    const gender = url.searchParams.get('gender')
    const labelId = url.searchParams.get('labelId')
    const archived = url.searchParams.get('archived') ?? 'ACTIVE'
    const permission = url.searchParams.get('permission') ?? ''
    if (gender && !['MALE', 'FEMALE', 'UNKNOWN'].includes(gender)) return NextResponse.json({ error: 'INVALID_GENDER_FILTER' }, { status: 422 })
    if (labelId && !z.string().uuid().safeParse(labelId).success) return NextResponse.json({ error: 'INVALID_LABEL_FILTER' }, { status: 422 })
    if (!['ACTIVE', 'ARCHIVED', 'ALL'].includes(archived)) return NextResponse.json({ error: 'INVALID_ARCHIVE_FILTER' }, { status: 422 })
    if (permission && !['OPTED_IN', 'OPTED_OUT', 'UNKNOWN'].includes(permission)) return NextResponse.json({ error: 'INVALID_PERMISSION_FILTER' }, { status: 422 })
    const { data, error } = await supabase.rpc('get_contacts_workspace', { p_q: query, p_gender: gender || null, p_label_id: labelId || null, p_archived: archived, p_permission: permission || null, p_page: page, p_page_size: pageSize })
    if (error) return NextResponse.json({ error: 'CONTACTS_LOAD_FAILED' }, { status: 400 })
    const workspace = (data ?? {}) as { contacts?: unknown[]; total?: number }
    return NextResponse.json({ contacts: workspace.contacts ?? [], total: workspace.total ?? 0, page, pageSize })
  } catch (error) {
    const message = error instanceof Error && error.message === 'UNAUTHORIZED' ? error.message : 'CONTACTS_LOAD_FAILED'
    return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 })
  }
}

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 })
    const { supabase, user } = await requireUser()
    const parsed = createSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_CONTACT' }, { status: 422 })
    const region = process.env.DEFAULT_PHONE_REGION ?? 'CO'
    const normalized = normalizePhone(parsed.data.phone, region)
    if ('errorCode' in normalized) return NextResponse.json({ error: 'INVALID_PHONE' }, { status: 422 })
    const firstName = parsed.data.name.trim().split(/\s+/u)[0]
    if (parsed.data.labelIds.length) {
      const { data: ownedLabels, error: labelsError } = await supabase.from('labels').select('id').eq('owner_id', user.id).in('id', parsed.data.labelIds)
      if (labelsError || (ownedLabels?.length ?? 0) !== parsed.data.labelIds.length) return NextResponse.json({ error: 'INVALID_LABEL' }, { status: 422 })
    }
    const { data, error } = await supabase.from('contacts').insert({ owner_id: user.id, display_name: parsed.data.name.trim(), first_name: firstName, phone_e164: normalized.e164, phone_country: normalized.country ?? null, gender: parsed.data.gender, gender_reviewed: true, notes: parsed.data.notes?.trim() || null }).select('id, display_name, first_name, phone_e164, gender, notes, archived_at').single()
    if (error) {
      if (error.code === '23505') {
        const existing = await supabase.from('contacts').select('id').eq('owner_id', user.id).eq('phone_e164', normalized.e164).maybeSingle()
        return NextResponse.json({ error: 'CONTACT_ALREADY_EXISTS', contactId: existing.data?.id ?? null }, { status: 409 })
      }
      return NextResponse.json({ error: 'CONTACT_CREATE_FAILED' }, { status: 400 })
    }
    if (parsed.data.labelIds.length) {
      const relations = parsed.data.labelIds.map((labelId) => ({ owner_id: user.id, contact_id: data.id, label_id: labelId }))
      const relationResult = await supabase.from('contact_labels').insert(relations)
      if (relationResult.error) return NextResponse.json({ error: 'CONTACT_LABELS_FAILED' }, { status: 400 })
    }
    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    const message = error instanceof Error && error.message === 'UNAUTHORIZED' ? error.message : 'CONTACT_CREATE_FAILED'
    return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 })
  }
}
