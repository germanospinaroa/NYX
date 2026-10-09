export function toLocalDateTimeInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function localDateTimeInputToUtc(value: string): string {
  return new Date(value).toISOString()
}

export function scheduledRefreshDelay(scheduledAt: string, now = Date.now()): number {
  return Math.max(0, new Date(scheduledAt).getTime() - now)
}
