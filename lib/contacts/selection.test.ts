import { describe, expect, it } from 'vitest'
import { resolveContactIds, selectionCount, selectionIncludes, type ContactSelection } from './selection'

const filter = { mode: 'filter' as const, q: 'ana', gender: 'FEMALE', labelId: 'label-1', excludeIds: new Set<string>() }

describe('contacts selection model', () => {
  it('counts and includes every result when the filter is selected', () => {
    const selection: ContactSelection = { ...filter, total: 284 }
    expect(selectionCount(selection, 284)).toBe(284)
    expect(selectionIncludes(selection, 'contact-1')).toBe(true)
  })

  it('supports excluding individual rows from select-all results', () => {
    const selection: ContactSelection = { ...filter, total: 284, excludeIds: new Set(['contact-1']) }
    expect(selectionCount(selection, 284)).toBe(283)
    expect(selectionIncludes(selection, 'contact-1')).toBe(false)
    expect(selectionIncludes(selection, 'contact-2')).toBe(true)
  })

  it('counts page-only selections without implying a dynamic filter', () => {
    const selection: ContactSelection = { mode: 'ids', ids: new Set(['contact-1', 'contact-2']) }
    expect(selectionCount(selection, 284)).toBe(2)
    expect(selectionIncludes(selection, 'contact-2')).toBe(true)
    expect(selectionIncludes(selection, 'contact-3')).toBe(false)
  })

  it('returns explicit ids without a database request', async () => {
    const result = await resolveContactIds({} as never, 'owner-1', { mode: 'ids', contactIds: ['contact-1'] })
    expect(result).toEqual({ ids: ['contact-1'], error: null })
  })

  it('resolves an empty filtered audience through the set-based RPC', async () => {
    const client = { rpc: async () => ({ data: [], error: null }) } as never
    const result = await resolveContactIds(client, 'owner-1', { mode: 'filter', archived: 'ACTIVE' })
    expect(result).toEqual({ ids: [], error: null })
  })
})
