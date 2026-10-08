import { describe, expect, it } from 'vitest'
import { applyDraft, createDraft, dirtyDraftEntries, removeDrafts, type ReviewDraft } from './review-drafts'

const row = { id: 'row-1', normalized_name: 'Ana', raw_name: 'Ana', phone_e164: '+573001234567', raw_phone: '3001234567', gender_final: null, included: true }

describe('review dirty drafts', () => {
  it('keeps multiple edits keyed by row id across view changes', () => {
    const first = applyDraft({}, createDraft(row, { name: 'Ana María' }))
    const second = applyDraft(first, createDraft({ ...row, id: 'row-2', normalized_name: 'Luis', phone_e164: '+573001234568' }, { included: false }))

    expect(Object.keys(second)).toEqual(['row-1', 'row-2'])
    expect(dirtyDraftEntries(second)).toHaveLength(2)
  })

  it('removes only drafts acknowledged by one batch save', () => {
    const drafts: Record<string, ReviewDraft> = {
      'row-1': createDraft(row, { name: 'Ana María' }),
      'row-2': createDraft({ ...row, id: 'row-2' }, { included: false }),
    }

    expect(Object.keys(removeDrafts(drafts, ['row-1']))).toEqual(['row-2'])
  })
})
