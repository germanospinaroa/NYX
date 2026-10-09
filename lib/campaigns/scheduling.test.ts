import { describe, expect, it } from 'vitest'
import { DUE_RETRY_MS, SCHEDULED_FALLBACK_MS, localDateTimeInputToUtc, scheduledRefreshDelay, toLocalDateTimeInputValue } from './scheduling'

describe('campaign scheduling helpers', () => {
  it('builds datetime-local values in browser local time without ISO shifting', () => {
    const original = Date.prototype.getHours
    Date.prototype.getHours = () => 9
    const value = toLocalDateTimeInputValue(new Date(2026, 9, 9, 9, 7))
    Date.prototype.getHours = original
    expect(value).toMatch(/T09:07$/u)
  })
  it('converts the selected local value only on submit', () => {
    const value = localDateTimeInputToUtc('2026-10-09T09:07')
    expect(new Date(value).toISOString()).toBe(value)
  })
  it('bounds far future dates and avoids a due-time hot loop', () => {
    const now = Date.parse('2026-10-09T12:00:00Z')
    expect(scheduledRefreshDelay('2027-10-09T12:00:00Z', now)).toBe(SCHEDULED_FALLBACK_MS)
    expect(scheduledRefreshDelay('2026-11-18T12:00:00Z', now)).toBe(SCHEDULED_FALLBACK_MS)
    expect(scheduledRefreshDelay('2026-10-09T12:00:20Z', now)).toBe(20_000)
    expect(scheduledRefreshDelay('2026-10-09T11:59:59Z', now)).toBe(DUE_RETRY_MS)
    expect(scheduledRefreshDelay('not-a-date', now)).toBe(DUE_RETRY_MS)
  })
})
