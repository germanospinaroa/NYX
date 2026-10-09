import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const e164 = /^\+[1-9][0-9]{7,14}$/
const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261008190000_fix_messages_destination_check.sql'), 'utf8')

describe('messages destination E.164 contract', () => {
  it('accepts valid international destinations', () => {
    expect(e164.test('+573000000000')).toBe(true)
    expect(e164.test('+14155552671')).toBe(true)
  })

  it('rejects non-E.164 destinations', () => {
    expect(e164.test('573000000000')).toBe(false)
    expect(e164.test('+0123456789')).toBe(false)
    expect(e164.test('texto')).toBe(false)
  })

  it('stores one regex escape before the plus sign', () => {
    expect(migration).toContain("destination ~ '^\\+[1-9][0-9]{7,14}$'")
    expect(migration).not.toContain("destination ~ '^\\\\+[1-9][0-9]{7,14}$'")
  })
})
