export const CAMPAIGN_VARIABLES = ['nombre', 'nombre_completo'] as const
export type CampaignVariable = typeof CAMPAIGN_VARIABLES[number]
export type RecipientSnapshotName = { firstNameSnapshot?: string | null; displayNameSnapshot?: string | null }

const variablePattern = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/gu

export function findUnsupportedVariables(value: string): string[] {
  const unsupported = new Set<string>()
  for (const match of value.matchAll(variablePattern)) if (!CAMPAIGN_VARIABLES.includes(match[1] as CampaignVariable)) unsupported.add(match[1])
  return [...unsupported]
}

export function requiresFirstName(value: string) { return /\{\{\s*nombre\s*\}\}/u.test(value) }

export function resolveCampaignTemplate(value: string, snapshot: RecipientSnapshotName): { value: string; error?: 'VARIABLE_NO_COMPATIBLE' | 'MISSING_RECIPIENT_NAME' } {
  const unsupported = findUnsupportedVariables(value)
  if (unsupported.length) return { value, error: 'VARIABLE_NO_COMPATIBLE' }
  const firstName = snapshot.firstNameSnapshot?.trim() || snapshot.displayNameSnapshot?.trim().split(/\s+/u)[0] || ''
  if (requiresFirstName(value) && !firstName) return { value, error: 'MISSING_RECIPIENT_NAME' }
  return { value: value.replace(/\{\{\s*nombre\s*\}\}/gu, firstName).replace(/\{\{\s*nombre_completo\s*\}\}/gu, snapshot.displayNameSnapshot?.trim() || '') }
}

export function resolveCampaignTemplateOrThrow(value: string, snapshot: RecipientSnapshotName) {
  const result = resolveCampaignTemplate(value, snapshot)
  if (result.error) throw new Error(result.error)
  return result.value
}
