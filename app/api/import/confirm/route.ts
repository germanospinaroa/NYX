import { NextResponse } from 'next/server'
import { parseContactFile } from '@/lib/imports/parser'
import { validateMapping, type ColumnMapping } from '@/lib/imports/mapping'
import { prepareImport } from '@/lib/imports/process'
import { persistPreparedImport } from '@/lib/imports/persistence'
import { requireUser } from '@/lib/supabase/user'
import { isSameOrigin } from '@/lib/security/request'

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 })
    const { supabase, user } = await requireUser()
    const form = await request.formData()
    const file = form.get('file')
    const mappingText = form.get('mapping')
    if (!(file instanceof File) || typeof mappingText !== 'string') return NextResponse.json({ error: 'FILE_AND_MAPPING_REQUIRED' }, { status: 400 })
    let mapping: unknown
    try { mapping = JSON.parse(mappingText) } catch { return NextResponse.json({ error: 'INVALID_MAPPING' }, { status: 400 }) }
    const parsed = await parseContactFile(file)
    if (!validateMapping(parsed.headers, mapping as Partial<ColumnMapping>)) return NextResponse.json({ error: 'INVALID_MAPPING' }, { status: 422 })
    const { data: existing, error: existingError } = await supabase.from('contacts').select('phone_e164').eq('owner_id', user.id).limit(10000)
    if (existingError) return NextResponse.json({ error: 'CONTACTS_LOOKUP_FAILED' }, { status: 503 })
    const prepared = prepareImport(parsed.rows, mapping as ColumnMapping, new Set((existing ?? []).map((contact) => contact.phone_e164 as string)), process.env.DEFAULT_PHONE_REGION ?? 'CO')
    const result = await persistPreparedImport(supabase, user.id, file.name, parsed.format, prepared)
    return NextResponse.json({ ...result, summary: prepared.summary })
  } catch (error) {
    const message = error instanceof Error && error.message === 'UNAUTHORIZED' ? error.message : 'IMPORT_FAILED'
    return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 })
  }
}
