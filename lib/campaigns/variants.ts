export type Gender = 'MALE' | 'FEMALE' | 'UNKNOWN'
export const CONTENT_VARIANT_KEYS = ['A', 'B', 'C', 'D', 'E'] as const
export type ContentVariantKey = typeof CONTENT_VARIANT_KEYS[number]
export type ContentVariantDraft = { key: string; steps: Array<{ type: 'TEXT' | 'IMAGE' | 'AUDIO' }> }

function stableHash(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function validateContentVariants(variants: ContentVariantDraft[]): true {
  if (variants.length < 1 || variants.length > CONTENT_VARIANT_KEYS.length) throw new Error('INVALID_VARIANT_COUNT')
  const keys = variants.map((variant) => variant.key)
  if (keys.some((key) => !CONTENT_VARIANT_KEYS.includes(key as ContentVariantKey)) || new Set(keys).size !== keys.length) throw new Error('INVALID_VARIANT_KEY')
  const [first] = variants
  if (!first.steps.length || first.steps.length > 50) throw new Error('INVALID_VARIANT_STEPS')
  for (const variant of variants) {
    if (variant.steps.length !== first.steps.length) throw new Error('VARIANT_STEP_COUNT_MISMATCH')
    variant.steps.forEach((step, index) => {
      if (step.type !== first.steps[index]?.type) throw new Error('VARIANT_STEP_TYPE_MISMATCH')
    })
  }
  return true
}

export function assignContentVariants(campaignId: string, contactIds: string[], keys: string[]): Record<string, ContentVariantKey> {
  if (!keys.length) throw new Error('INVALID_VARIANT_COUNT')
  const ordered = [...contactIds].sort((left, right) => {
    const leftHash = stableHash(`${campaignId}:${left}`)
    const rightHash = stableHash(`${campaignId}:${right}`)
    return leftHash - rightHash || left.localeCompare(right)
  })
  return Object.fromEntries(ordered.map((contactId, index) => [contactId, keys[index % keys.length] as ContentVariantKey]))
}

export function resolveMessageVariant(gender: Gender, messages: { neutral: string; male?: string; female?: string }): { variant: 'NEUTRAL' | 'MALE' | 'FEMALE'; text: string } {
  if (gender === 'MALE' && messages.male?.trim()) return { variant: 'MALE', text: messages.male }
  if (gender === 'FEMALE' && messages.female?.trim()) return { variant: 'FEMALE', text: messages.female }
  return { variant: 'NEUTRAL', text: messages.neutral }
}
