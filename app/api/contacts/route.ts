import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/user'

function escapeLike(value: string) { return value.replace(/[\\%_,().]/gu, (char) => `\\${char}`) }

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser()
    const url = new URL(request.url)
    const page = Math.max(Number(url.searchParams.get('page') ?? 0) || 0, 0)
    const pageSize = Math.min(Math.max(Number(url.searchParams.get('pageSize') ?? 50) || 50, 1), 100)
    const query = escapeLike((url.searchParams.get('q') ?? '').trim().slice(0, 100))
    const gender = url.searchParams.get('gender')
    const labelId = url.searchParams.get('labelId')
    const selection = labelId
      ? 'id, display_name, first_name, phone_e164, gender, gender_reviewed, created_at, contact_labels!inner(label_id, labels(id, name, color))'
      : 'id, display_name, first_name, phone_e164, gender, gender_reviewed, created_at, contact_labels(label_id, labels(id, name, color))'
    let builder = supabase.from('contacts').select(selection, { count: 'exact' }).eq('owner_id', user.id).order('created_at', { ascending: false }).range(page * pageSize, page * pageSize + pageSize - 1)
    if (query) builder = builder.or(`display_name.ilike.%${query}%,phone_e164.ilike.%${query}%`)
    if (gender && ['MALE', 'FEMALE', 'UNKNOWN'].includes(gender)) builder = builder.eq('gender', gender)
    if (labelId) builder = builder.eq('contact_labels.label_id', labelId)
    const { data, count, error } = await builder
    if (error) return NextResponse.json({ error: 'CONTACTS_LOAD_FAILED' }, { status: 400 })
    return NextResponse.json({ contacts: data ?? [], total: count ?? 0, page, pageSize })
  } catch (error) {
    const message = error instanceof Error && error.message === 'UNAUTHORIZED' ? error.message : 'CONTACTS_LOAD_FAILED'
    return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 })
  }
}
