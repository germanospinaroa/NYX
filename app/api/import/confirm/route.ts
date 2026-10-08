import { NextResponse } from 'next/server'
import { parseContactFile } from '@/lib/imports/parser'
import { validateMapping, type ColumnMapping } from '@/lib/imports/mapping'
import { prepareImport } from '@/lib/imports/process'
import { ImportOutcomeUnknownError, persistPreparedImport } from '@/lib/imports/persistence'
import { requireUser } from '@/lib/supabase/user'
import { isSameOrigin } from '@/lib/security/request'
import { z } from 'zod'

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 })
    const { supabase, user } = await requireUser()
    const form = await request.formData()
    const file = form.get('file')
    const mappingText = form.get('mapping')
    const idempotencyKey = form.get('idempotency_key')
    if (!(file instanceof File) || typeof mappingText !== 'string' || typeof idempotencyKey !== 'string') return NextResponse.json({ error: 'FILE_MAPPING_AND_IDEMPOTENCY_KEY_REQUIRED' }, { status: 400 })
    const parsedIdempotencyKey = z.string().uuid().safeParse(idempotencyKey)
    if (!parsedIdempotencyKey.success) return NextResponse.json({ error: 'INVALID_IDEMPOTENCY_KEY' }, { status: 422 })
    let mapping: unknown
    try { mapping = JSON.parse(mappingText) } catch { return NextResponse.json({ error: 'INVALID_MAPPING' }, { status: 400 }) }
    const parsed = await parseContactFile(file)
    if (!validateMapping(parsed.headers, mapping as Partial<ColumnMapping>)) return NextResponse.json({ error: 'INVALID_MAPPING' }, { status: 422 })
    // Existing contacts are resolved set-wise inside finalize_contact_import;
    // do not transfer the owner's contact set back to the browser.
    const prepared = prepareImport(parsed.rows, mapping as ColumnMapping, new Set(), process.env.DEFAULT_PHONE_REGION ?? 'CO')
    const result = await persistPreparedImport(supabase, user.id, file.name, parsed.format, prepared, parsedIdempotencyKey.data)
    return NextResponse.json({ ...result, summary: prepared.summary, reviewRequired: true })
  } catch (error) {
    if (error instanceof ImportOutcomeUnknownError) return NextResponse.json({ error: 'IMPORT_OUTCOME_UNKNOWN', importId: error.importId }, { status: 202 })
    const message = error instanceof Error && error.message === 'UNAUTHORIZED' ? error.message : 'IMPORT_FAILED'
    return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 })
  }
}
