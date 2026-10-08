export type ReviewDraft = {
  id: string
  name: string
  phone: string
  genderFinal: 'MALE' | 'FEMALE' | 'UNKNOWN' | null
  included: boolean
}

export type ReviewDraftRow = {
  id: string
  normalized_name: string | null
  raw_name: string
  phone_e164: string | null
  raw_phone: string
  gender_final: string | null
  included: boolean
}

export function createDraft(row: ReviewDraftRow, overrides: Partial<Omit<ReviewDraft, 'id'>> = {}): ReviewDraft {
  return {
    id: row.id,
    name: row.normalized_name ?? row.raw_name,
    phone: row.phone_e164 ?? row.raw_phone,
    genderFinal: asGender(row.gender_final),
    included: row.included,
    ...overrides,
  }
}

export function applyDraft(drafts: Record<string, ReviewDraft>, draft: ReviewDraft): Record<string, ReviewDraft> {
  return { ...drafts, [draft.id]: draft }
}

export function dirtyDraftEntries(drafts: Record<string, ReviewDraft>): ReviewDraft[] {
  return Object.values(drafts)
}

export function removeDrafts(drafts: Record<string, ReviewDraft>, ids: string[]): Record<string, ReviewDraft> {
  const next = { ...drafts }
  ids.forEach((id) => { delete next[id] })
  return next
}

function asGender(value: string | null): ReviewDraft['genderFinal'] {
  return value === 'MALE' || value === 'FEMALE' || value === 'UNKNOWN' ? value : null
}
