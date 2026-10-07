import { NextResponse } from 'next/server'
import { parseContactFile } from '@/lib/imports/parser'
import { autoDetectMapping, validateMapping } from '@/lib/imports/mapping'
import { prepareImport } from '@/lib/imports/process'
import { requireUser } from '@/lib/supabase/user'
import { isSameOrigin } from '@/lib/security/request'

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 })
    const { supabase, user } = await requireUser()
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'FILE_REQUIRED' }, { status: 400 })
    const parsed = await parseContactFile(file)
    const detected = autoDetectMapping(parsed.headers)
    const initialMapping = { name: detected.name ?? parsed.headers[0] ?? '', phone: detected.phone ?? parsed.headers[1] ?? '' }
    if (!validateMapping(parsed.headers, initialMapping)) {
      return NextResponse.json({ format: parsed.format, headers: parsed.headers, mapping: initialMapping, preview: parsed.rows.slice(0, 5), summary: null })
    }
    const { data: existing, error: existingError } = await supabase.from('contacts').select('phone_e164').eq('owner_id', user.id).limit(10000)
    if (existingError) return NextResponse.json({ error: 'CONTACTS_LOOKUP_FAILED' }, { status: 503 })
    const existingPhones = new Set((existing ?? []).map((contact) => contact.phone_e164 as string))
    const prepared = prepareImport(parsed.rows, initialMapping, existingPhones, process.env.DEFAULT_PHONE_REGION ?? 'CO')
    return NextResponse.json({ format: parsed.format, headers: parsed.headers, mapping: initialMapping, preview: parsed.rows.slice(0, 5), summary: prepared.summary })
  } catch (error) {
    const message = error instanceof Error && ['UNAUTHORIZED', 'SUPABASE_NOT_CONFIGURED'].includes(error.message) ? error.message : 'PREVIEW_FAILED'
    return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 })
  }
}
