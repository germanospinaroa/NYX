export const SCHEDULED_FALLBACK_MS = 30_000
export const DUE_RETRY_MS = 2_000

export function toLocalDateTimeInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function localDateTimeInputToUtc(value: string): string {
  return new Date(value).toISOString()
}

export function scheduledRefreshDelay(scheduledAt: string, now = Date.now()): number {
  const due = new Date(scheduledAt).getTime()
  if (!Number.isFinite(due)) return DUE_RETRY_MS
  const diff = due - now
  if (diff > SCHEDULED_FALLBACK_MS) return SCHEDULED_FALLBACK_MS
  if (diff > 0) return diff
  return DUE_RETRY_MS
}
