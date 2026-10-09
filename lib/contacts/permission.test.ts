import { describe, expect, it } from 'vitest'
import { matchesPermissionFilter } from './permission'

describe('permission filter semantics', () => {
  it('treats a missing row as UNKNOWN', () => {
    expect(matchesPermissionFilter(null, 'UNKNOWN')).toBe(true)
    expect(matchesPermissionFilter(undefined, 'OPTED_IN')).toBe(false)
  })
  it('does not mix explicit permission states', () => {
    expect(matchesPermissionFilter('UNKNOWN', 'UNKNOWN')).toBe(true)
    expect(matchesPermissionFilter('OPTED_IN', 'UNKNOWN')).toBe(false)
    expect(matchesPermissionFilter('OPTED_OUT', 'UNKNOWN')).toBe(false)
  })
})
