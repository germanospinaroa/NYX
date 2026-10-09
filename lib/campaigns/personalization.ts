export const CAMPAIGN_VARIABLES = ['nombre', 'nombre_completo'] as const
export type CampaignVariable = typeof CAMPAIGN_VARIABLES[number]
export type RecipientSnapshotName = { firstNameSnapshot?: string | null; displayNameSnapshot?: string | null }
export type CampaignVariantStep = { type: 'TEXT' | 'IMAGE' | 'AUDIO'; neutralText?: string; maleText?: string; femaleText?: string; neutralCaption?: string; maleCaption?: string; femaleCaption?: string }

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

export function resolveCampaignVariant(gender: string | null | undefined, steps: CampaignVariantStep[]): 'NEUTRAL' | 'MALE' | 'FEMALE' {
  if (gender === 'MALE' && steps.some((step) => Boolean(step.maleText?.trim() || step.maleCaption?.trim()))) return 'MALE'
  if (gender === 'FEMALE' && steps.some((step) => Boolean(step.femaleText?.trim() || step.femaleCaption?.trim()))) return 'FEMALE'
  return 'NEUTRAL'
}

export function resolveCampaignStep(step: CampaignVariantStep, variant: 'NEUTRAL' | 'MALE' | 'FEMALE', snapshot: RecipientSnapshotName) {
  if (step.type === 'AUDIO') return { text: '', caption: '' }
  const text = variant === 'MALE' ? step.maleText || step.neutralText || '' : variant === 'FEMALE' ? step.femaleText || step.neutralText || '' : step.neutralText || ''
  const caption = variant === 'MALE' ? step.maleCaption || step.neutralCaption || '' : variant === 'FEMALE' ? step.femaleCaption || step.neutralCaption || '' : step.neutralCaption || ''
  return { text: resolveCampaignTemplate(text, snapshot).value, caption: resolveCampaignTemplate(caption, snapshot).value }
}
