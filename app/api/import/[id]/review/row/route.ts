import { NextResponse } from 'next/server'
import { z } from 'zod'
import { normalizeName } from '@/lib/contacts/name'
import { normalizePhone } from '@/lib/phone/normalize'
import { requireUser } from '@/lib/supabase/user'
import { isSameOrigin } from '@/lib/security/request'

const rowSchema = z.object({
  name: z.string().max(255),
  phone: z.string().max(100),
  genderFinal: z.enum(['MALE', 'FEMALE', 'UNKNOWN']).nullable(),
  included: z.boolean(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!isSameOrigin(request)) return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 })
    const { supabase, user } = await requireUser()
    const { id } = await params
    const rowId = new URL(request.url).searchParams.get('rowId')
    if (!rowId || !z.string().uuid().safeParse(rowId).success) return NextResponse.json({ error: 'INVALID_ROW' }, { status: 422 })
    const parsed = rowSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_ROW' }, { status: 422 })
    const name = normalizeName(parsed.data.name)
    const phone = normalizePhone(parsed.data.phone, process.env.DEFAULT_PHONE_REGION ?? 'CO')
    const { data: current, error: currentError } = await supabase.from('contact_import_rows')
      .select('id, phone_e164, gender_final').eq('id', rowId).eq('import_id', id).eq('owner_id', user.id).maybeSingle()
    if (currentError || !current) return NextResponse.json({ error: 'IMPORT_ROW_NOT_FOUND' }, { status: 404 })
    const nameInvalid = 'errorCode' in name
    const phoneInvalid = 'errorCode' in phone
    let result: 'VALID' | 'MATCHED_EXISTING' | 'DUPLICATE_IN_FILE' | 'INVALID_NAME' | 'INVALID_PHONE' = 'VALID'
    if (nameInvalid) result = 'INVALID_NAME'
    else if (phoneInvalid) result = 'INVALID_PHONE'
    else {
      const { data: duplicates } = await supabase.from('contact_import_rows').select('id').eq('import_id', id).eq('owner_id', user.id).eq('phone_e164', phone.e164).neq('id', rowId).limit(1)
      if (duplicates?.length) result = 'DUPLICATE_IN_FILE'
      else {
        const { data: existing } = await supabase.from('contacts').select('id').eq('owner_id', user.id).eq('phone_e164', phone.e164).maybeSingle()
        if (existing) result = 'MATCHED_EXISTING'
      }
    }
    const { data, error } = await supabase.rpc('update_contact_import_row', {
      p_import_id: id, p_row_id: rowId,
      p_normalized_name: nameInvalid ? null : name.displayName,
      p_first_name: nameInvalid ? null : name.firstName,
      p_phone_e164: phoneInvalid ? null : phone.e164,
      p_phone_country: phoneInvalid ? null : phone.country,
      p_result: result,
      p_error_code: nameInvalid ? name.errorCode : phoneInvalid ? phone.errorCode : null,
      p_gender_final: parsed.data.genderFinal,
      p_included: parsed.data.included,
    })
    if (error) return NextResponse.json({ error: 'ROW_UPDATE_FAILED' }, { status: 400 })
    return NextResponse.json({ row: data })
  } catch (error) {
    const message = error instanceof Error && error.message === 'UNAUTHORIZED' ? error.message : 'ROW_UPDATE_FAILED'
    return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 })
  }
}
