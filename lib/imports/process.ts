import { normalizeName } from '@/lib/contacts/name'
import { normalizePhone } from '@/lib/phone/normalize'
import type { ColumnMapping } from './mapping'

export type ImportRowResult =
  | 'VALID'
  | 'INVALID_NAME'
  | 'INVALID_PHONE'
  | 'DUPLICATE_IN_FILE'
  | 'MATCHED_EXISTING'

export type PreparedImportRow = {
  rowNumber: number
  rawName: string
  rawPhone: string
  normalizedName?: string
  firstName?: string
  phoneE164?: string
  phoneCountry?: string
  result: ImportRowResult
  errorCode?: 'INVALID_NAME' | 'INVALID_PHONE'
}

export type ImportPreparation = {
  rows: PreparedImportRow[]
  summary: {
    total: number
    valid: number
    invalid: number
    duplicateInFile: number
    matchedExisting: number
  }
}

export function prepareImport(
  sourceRows: Record<string, string>[],
  mapping: ColumnMapping,
  existingPhones: ReadonlySet<string>,
  defaultRegion: string,
): ImportPreparation {
  const seen = new Set<string>()
  const rows: PreparedImportRow[] = sourceRows.map((sourceRow, index): PreparedImportRow => {
    const rawName = sourceRow[mapping.name] ?? ''
    const rawPhone = sourceRow[mapping.phone] ?? ''
    const name = normalizeName(rawName)
    if ('errorCode' in name) {
      return { rowNumber: index + 2, rawName, rawPhone, result: 'INVALID_NAME', errorCode: name.errorCode }
    }
    const phone = normalizePhone(rawPhone, defaultRegion)
    if ('errorCode' in phone) {
      return {
        rowNumber: index + 2,
        rawName,
        rawPhone,
        normalizedName: name.displayName,
        firstName: name.firstName,
        result: 'INVALID_PHONE',
        errorCode: phone.errorCode,
      }
    }
    if (seen.has(phone.e164)) {
      return {
        rowNumber: index + 2,
        rawName,
        rawPhone,
        normalizedName: name.displayName,
        firstName: name.firstName,
        phoneE164: phone.e164,
        phoneCountry: phone.country,
        result: 'DUPLICATE_IN_FILE',
      }
    }
    seen.add(phone.e164)
    return {
      rowNumber: index + 2,
      rawName,
      rawPhone,
      normalizedName: name.displayName,
      firstName: name.firstName,
      phoneE164: phone.e164,
      phoneCountry: phone.country,
      result: existingPhones.has(phone.e164) ? 'MATCHED_EXISTING' : 'VALID',
    }
  })
  const valid = rows.filter((row) => row.result === 'VALID' || row.result === 'MATCHED_EXISTING').length
  const duplicateInFile = rows.filter((row) => row.result === 'DUPLICATE_IN_FILE').length
  const matchedExisting = rows.filter((row) => row.result === 'MATCHED_EXISTING').length
  return {
    rows,
    summary: {
      total: rows.length,
      valid,
      invalid: rows.filter((row) => row.result === 'INVALID_NAME' || row.result === 'INVALID_PHONE').length,
      duplicateInFile,
      matchedExisting,
    },
  }
}
