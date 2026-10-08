export type ColumnMapping = {
  name: string
  phone: string
  genderSuggestion?: string
  genderConfidence?: string
  genderReview?: string
}

const NAME_HEADERS = ['name', 'nombre', 'full name', 'fullname', 'nombre completo', 'contact', 'contacto']
const PHONE_HEADERS = [
  'phone',
  'teléfono',
  'teléfono móvil',
  'telefono',
  'mobile',
  'móvil',
  'movil',
  'celular',
  'whatsapp',
  'whatsapp number',
]
const GENDER_SUGGESTION_HEADERS = ['gender suggestion', 'género sugerido', 'genero sugerido', 'gender', 'género', 'genero']
const GENDER_CONFIDENCE_HEADERS = ['gender confidence', 'confianza género', 'confianza genero', 'confidence', 'confianza']
const GENDER_REVIEW_HEADERS = ['gender review', 'revisión género', 'revision genero', 'gender reviewed', 'género revisado', 'genero revisado']

function normalizedHeader(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/gu, ' ')
}

function findHeader(headers: string[], candidates: string[]): string | undefined {
  return headers.find((header) => candidates.includes(normalizedHeader(header)))
}

export function autoDetectMapping(headers: string[]): Partial<ColumnMapping> {
  const name = findHeader(headers, NAME_HEADERS)
  const phone = findHeader(headers, PHONE_HEADERS)
  const genderSuggestion = findHeader(headers, GENDER_SUGGESTION_HEADERS)
  const genderConfidence = findHeader(headers, GENDER_CONFIDENCE_HEADERS)
  const genderReview = findHeader(headers, GENDER_REVIEW_HEADERS)
  return {
    ...(name ? { name } : {}),
    ...(phone ? { phone } : {}),
    ...(genderSuggestion ? { genderSuggestion } : {}),
    ...(genderConfidence ? { genderConfidence } : {}),
    ...(genderReview ? { genderReview } : {}),
  }
}

export function validateMapping(headers: string[], mapping: Partial<ColumnMapping>): mapping is ColumnMapping {
  return Boolean(
    mapping.name && mapping.phone && mapping.name !== mapping.phone &&
    headers.includes(mapping.name) && headers.includes(mapping.phone),
  )
}
