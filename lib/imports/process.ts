import { normalizeName } from '@/lib/contacts/name'
import { normalizePhone } from '@/lib/phone/normalize'
import type { ColumnMapping } from './mapping'

export type ImportRowResult =
  | 'VALID'
  | 'INVALID_NAME'
  | 'INVALID_PHONE'
  | 'DUPLICATE_IN_FILE'
  | 'MATCHED_EXISTING'

export type GenderValue = 'MALE' | 'FEMALE' | 'UNKNOWN'
export type GenderConfidence = 'HIGH' | 'MEDIUM' | 'LOW'
export type GenderReviewStatus = 'PENDING' | 'REVIEWED'

export type PreparedImportRow = {
  rowNumber: number
  rawName: string
  rawPhone: string
  normalizedName?: string
  firstName?: string
  phoneE164?: string
  phoneCountry?: string
  genderSuggestion: GenderValue | null
  genderConfidence: GenderConfidence | null
  genderFinal: GenderValue | null
  genderReviewStatus: GenderReviewStatus
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
  const hasGenderColumns = Boolean(mapping.genderSuggestion || mapping.genderConfidence || mapping.genderReview)
  const rows: PreparedImportRow[] = sourceRows.map((sourceRow, index): PreparedImportRow => {
    const rawName = sourceRow[mapping.name] ?? ''
    const rawPhone = sourceRow[mapping.phone] ?? ''
    const name = normalizeName(rawName)
    if ('errorCode' in name) {
      return { rowNumber: index + 2, rawName, rawPhone, result: 'INVALID_NAME', errorCode: name.errorCode, ...initialGender(sourceRow, mapping, hasGenderColumns) }
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
        ...initialGender(sourceRow, mapping, hasGenderColumns),
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
        ...initialGender(sourceRow, mapping, hasGenderColumns),
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
      ...initialGender(sourceRow, mapping, hasGenderColumns),
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

function initialGender(
  sourceRow: Record<string, string>,
  mapping: ColumnMapping,
  hasGenderColumns: boolean,
): Pick<PreparedImportRow, 'genderSuggestion' | 'genderConfidence' | 'genderFinal' | 'genderReviewStatus'> {
  const suggestion = parseGender(mapping.genderSuggestion ? sourceRow[mapping.genderSuggestion] : '')
  const confidence = parseConfidence(mapping.genderConfidence ? sourceRow[mapping.genderConfidence] : '')
  const sourceMarkedReviewed = normalizeToken(mapping.genderReview ? sourceRow[mapping.genderReview] : '') === 'REVIEWED'
  return {
    genderSuggestion: suggestion,
    genderConfidence: confidence,
    // No gender columns means an explicit unknown, while a suggestion is
    // never promoted to final without review in NYX.
    genderFinal: !hasGenderColumns || sourceMarkedReviewed ? 'UNKNOWN' : null,
    genderReviewStatus: !hasGenderColumns || sourceMarkedReviewed ? 'REVIEWED' : 'PENDING',
  }
}

function normalizeToken(value: string | undefined): string {
  return (value ?? '').trim().toLocaleUpperCase().replace(/\s+/gu, ' ')
}

export function parseGender(value: string): GenderValue | null {
  const token = normalizeToken(value)
  if (['MALE', 'MAN', 'HOMBRE', 'M'].includes(token)) return 'MALE'
  if (['FEMALE', 'WOMAN', 'MUJER', 'F'].includes(token)) return 'FEMALE'
  if (['UNKNOWN', 'DESCONOCIDO', 'UNKNOWN/GENDER', 'U'].includes(token)) return 'UNKNOWN'
  return null
}

export function parseConfidence(value: string): GenderConfidence | null {
  const token = normalizeToken(value)
  if (['HIGH', 'ALTA', 'ALTO'].includes(token)) return 'HIGH'
  if (['MEDIUM', 'MEDIA', 'MEDIO'].includes(token)) return 'MEDIUM'
  if (['LOW', 'BAJA', 'BAJO'].includes(token)) return 'LOW'
  return null
}
