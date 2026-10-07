export type NameNormalization =
  | { displayName: string; firstName: string }
  | { errorCode: 'INVALID_NAME' }

export function normalizeName(rawValue: string): NameNormalization {
  const displayName = rawValue.trim().replace(/\s+/gu, ' ')
  if (!displayName) return { errorCode: 'INVALID_NAME' }
  return { displayName, firstName: displayName.split(' ')[0] }
}
