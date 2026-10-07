import type { SupabaseClient } from '@supabase/supabase-js'
import type { ImportPreparation, PreparedImportRow } from './process'

type ImportFormat = 'CSV' | 'XLSX'

function safeFilename(filename: string): string {
  return filename.replace(/[\u0000-\u001f\u007f]/gu, '').slice(0, 255) || 'contact-import'
}

export async function persistPreparedImport(
  supabase: SupabaseClient,
  ownerId: string,
  filename: string,
  format: ImportFormat,
  preparation: ImportPreparation,
) {
  const { data: importRecord, error: createError } = await supabase
    .from('contact_imports')
    .insert({
      owner_id: ownerId,
      original_filename: safeFilename(filename),
      source_format: format,
      status: 'PENDING',
      total_rows: preparation.summary.total,
      valid_rows: preparation.summary.valid,
      duplicate_rows: preparation.summary.duplicateInFile,
      invalid_rows: preparation.summary.invalid,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (createError || !importRecord) throw new Error('IMPORT_CREATE_FAILED')

  const importId = importRecord.id as string
  try {
    const { error: processingError } = await supabase
      .from('contact_imports')
      .update({ status: 'PROCESSING' })
      .eq('id', importId)
    if (processingError) throw new Error('IMPORT_UPDATE_FAILED')

    const rowPayload = preparation.rows.map((row) => toImportRow(ownerId, importId, row))
    if (rowPayload.length) {
      const { error: rowsError } = await supabase.from('contact_import_rows').insert(rowPayload)
      if (rowsError) throw new Error('IMPORT_ROWS_FAILED')
    }

    let createdContacts = 0
    let matchedExistingContacts = preparation.summary.matchedExisting
    for (const row of preparation.rows) {
      if (row.result === 'MATCHED_EXISTING' && row.phoneE164) {
        const contactId = await findContactId(supabase, ownerId, row.phoneE164)
        if (!contactId) throw new Error('CONTACT_LOOKUP_FAILED')
        await updateRow(supabase, importId, row.rowNumber, { contact_id: contactId })
        continue
      }
      if (row.result !== 'VALID' || !row.phoneE164 || !row.normalizedName || !row.firstName) continue
      const { data: created, error } = await supabase
        .from('contacts')
        .insert({
          owner_id: ownerId,
          display_name: row.normalizedName,
          first_name: row.firstName,
          phone_e164: row.phoneE164,
          phone_country: row.phoneCountry,
        })
        .select('id')
        .single()
      if (error && error.code !== '23505') throw new Error('CONTACT_CREATE_FAILED')
      if (error || !created) {
        const existingId = await findContactId(supabase, ownerId, row.phoneE164)
        if (!existingId) throw new Error('CONTACT_CREATE_FAILED')
        matchedExistingContacts += 1
        await updateRow(supabase, importId, row.rowNumber, { result: 'MATCHED_EXISTING', contact_id: existingId })
      } else {
        createdContacts += 1
        await updateRow(supabase, importId, row.rowNumber, { result: 'CREATED', contact_id: created.id })
      }
    }

    const { error: completeError } = await supabase
      .from('contact_imports')
      .update({
        status: 'COMPLETED',
        created_contacts: createdContacts,
        matched_existing_contacts: matchedExistingContacts,
        completed_at: new Date().toISOString(),
      })
      .eq('id', importId)
    if (completeError) throw new Error('IMPORT_COMPLETE_FAILED')
    return { importId, createdContacts, matchedExistingContacts }
  } catch (error) {
    await supabase.from('contact_imports').update({ status: 'FAILED' }).eq('id', importId)
    throw error instanceof Error && error.message.startsWith('IMPORT_')
      ? error
      : new Error('IMPORT_FAILED')
  }
}

function toImportRow(ownerId: string, importId: string, row: PreparedImportRow) {
  return {
    owner_id: ownerId,
    import_id: importId,
    row_number: row.rowNumber,
    raw_name: row.rawName,
    raw_phone: row.rawPhone,
    normalized_name: row.normalizedName ?? null,
    phone_e164: row.phoneE164 ?? null,
    result: row.result,
    error_code: row.errorCode ?? null,
  }
}

async function findContactId(supabase: SupabaseClient, ownerId: string, phoneE164: string): Promise<string | null> {
  const { data, error } = await supabase.from('contacts').select('id').eq('owner_id', ownerId).eq('phone_e164', phoneE164).maybeSingle()
  if (error) throw new Error('CONTACT_LOOKUP_FAILED')
  return (data?.id as string | undefined) ?? null
}

async function updateRow(
  supabase: SupabaseClient,
  importId: string,
  rowNumber: number,
  values: { result?: 'CREATED' | 'MATCHED_EXISTING'; contact_id: string },
) {
  const { error } = await supabase.from('contact_import_rows').update(values).eq('import_id', importId).eq('row_number', rowNumber)
  if (error) throw new Error('IMPORT_ROW_UPDATE_FAILED')
}
