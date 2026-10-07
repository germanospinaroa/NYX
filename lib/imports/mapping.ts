export type ColumnMapping = { name: string; phone: string }

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

function normalizedHeader(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/gu, ' ')
}

function findHeader(headers: string[], candidates: string[]): string | undefined {
  return headers.find((header) => candidates.includes(normalizedHeader(header)))
}

export function autoDetectMapping(headers: string[]): Partial<ColumnMapping> {
  const name = findHeader(headers, NAME_HEADERS)
  const phone = findHeader(headers, PHONE_HEADERS)
  return { ...(name ? { name } : {}), ...(phone ? { phone } : {}) }
}

export function validateMapping(headers: string[], mapping: Partial<ColumnMapping>): mapping is ColumnMapping {
  return Boolean(
    mapping.name && mapping.phone && mapping.name !== mapping.phone &&
    headers.includes(mapping.name) && headers.includes(mapping.phone),
  )
}
