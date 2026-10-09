import { describe, expect, it } from 'vitest'
import { localDateTimeInputToUtc, scheduledRefreshDelay, toLocalDateTimeInputValue } from './scheduling'

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
  it('never schedules a negative timeout', () => expect(scheduledRefreshDelay('2020-01-01T00:00:00Z', Date.now())).toBe(0))
})
