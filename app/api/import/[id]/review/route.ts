import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/lib/supabase/user'
import { isSameOrigin } from '@/lib/security/request'
import { normalizeName } from '@/lib/contacts/name'
import { normalizePhone } from '@/lib/phone/normalize'

const filters = ['ALL', 'READY', 'REVIEW_REQUIRED', 'INVALID', 'DUPLICATE', 'EXISTING', 'EXCLUDED'] as const

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requireUser()
    const { id } = await params
    const url = new URL(request.url)
    const page = Math.max(Number(url.searchParams.get('page') ?? 0) || 0, 0)
    const pageSize = Math.min(Math.max(Number(url.searchParams.get('pageSize') ?? 50) || 50, 1), 100)
    const filter = filters.includes((url.searchParams.get('filter') ?? 'ALL') as typeof filters[number]) ? url.searchParams.get('filter') : 'ALL'
    const query = (url.searchParams.get('q') ?? '').slice(0, 100)
    const { data, error } = await supabase.rpc('get_contact_import_review', {
      p_import_id: id, p_page: page, p_page_size: pageSize, p_filter: filter, p_query: query,
    })
    if (error) return NextResponse.json({ error: 'REVIEW_LOAD_FAILED' }, { status: 400 })
    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error && error.message === 'UNAUTHORIZED' ? error.message : 'REVIEW_LOAD_FAILED'
    return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 })
  }
}

const actionSchema = z.object({
  rowIds: z.array(z.string().uuid()).min(1).max(1000),
  action: z.enum(['ACCEPT_SUGGESTION', 'ACCEPT_HIGH', 'MARK_REVIEWED', 'EXCLUDE', 'INCLUDE']),
})

const draftSchema = z.object({
  id: z.string().uuid(),
  name: z.string().max(255),
  phone: z.string().max(100),
  genderFinal: z.enum(['MALE', 'FEMALE', 'UNKNOWN']).nullable(),
  included: z.boolean(),
})

const batchDraftSchema = z.object({ changes: z.array(draftSchema).min(1).max(1000) })

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!isSameOrigin(request)) return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 })
    const { supabase } = await requireUser()
    const { id } = await params
    const parsed = batchDraftSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_REVIEW_CHANGES' }, { status: 422 })
    if (new Set(parsed.data.changes.map((change) => change.id)).size !== parsed.data.changes.length) {
      return NextResponse.json({ error: 'DUPLICATE_REVIEW_ROWS' }, { status: 422 })
    }
    const changes = parsed.data.changes.map((change) => {
      const name = normalizeName(change.name)
      const phone = normalizePhone(change.phone, process.env.DEFAULT_PHONE_REGION ?? 'CO')
      return {
        row_id: change.id,
        normalized_name: 'errorCode' in name ? null : name.displayName,
        first_name: 'errorCode' in name ? null : name.firstName,
        phone_e164: 'errorCode' in phone ? null : phone.e164,
        phone_country: 'errorCode' in phone ? null : phone.country,
        gender_final: change.genderFinal,
        included: change.included,
      }
    })
    const { data, error } = await supabase.rpc('bulk_update_contact_import_rows', {
      p_import_id: id,
      p_changes: changes,
    })
    if (error) return NextResponse.json({ error: 'REVIEW_BATCH_SAVE_FAILED' }, { status: 400 })
    return NextResponse.json({ updated: data })
  } catch (error) {
    const message = error instanceof Error && error.message === 'UNAUTHORIZED' ? error.message : 'REVIEW_BATCH_SAVE_FAILED'
    return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!isSameOrigin(request)) return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 })
    const { supabase } = await requireUser()
    const { id } = await params
    const parsed = actionSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_REVIEW_ACTION' }, { status: 422 })
    const { data, error } = await supabase.rpc('bulk_review_contact_import_rows', {
      p_import_id: id, p_row_ids: parsed.data.rowIds, p_action: parsed.data.action,
    })
    if (error) return NextResponse.json({ error: 'REVIEW_ACTION_FAILED' }, { status: 400 })
    return NextResponse.json({ updated: data })
  } catch (error) {
    const message = error instanceof Error && error.message === 'UNAUTHORIZED' ? error.message : 'REVIEW_ACTION_FAILED'
    return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 })
  }
}
