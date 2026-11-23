export type EvolutionConnectionState = 'CONNECTED' | 'DISCONNECTED' | 'UNKNOWN'

type ConnectionResponse = { instance?: { state?: unknown; status?: unknown } }

export async function getEvolutionConnectionState(): Promise<EvolutionConnectionState> {
  const baseUrl = process.env.EVOLUTION_BASE_URL?.replace(/\/$/u, '')
  const apiKey = process.env.EVOLUTION_API_KEY
  const instance = process.env.EVOLUTION_INSTANCE
  if (!baseUrl || !apiKey || !instance) return 'UNKNOWN'

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Number(process.env.EVOLUTION_HEALTH_TIMEOUT_MS ?? 5000))
  try {
    const response = await fetch(`${baseUrl}/instance/connectionState/${encodeURIComponent(instance)}`, {
      headers: { apikey: apiKey, accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!response.ok) return 'UNKNOWN'
    const body = await response.json().catch(() => null) as ConnectionResponse | null
    const state = String(body?.instance?.state ?? body?.instance?.status ?? '').toLowerCase()
    if (state === 'open' || state === 'connected') return 'CONNECTED'
    if (state === 'close' || state === 'closed' || state === 'disconnected') return 'DISCONNECTED'
    return 'UNKNOWN'
  } catch {
    return 'UNKNOWN'
  } finally {
    clearTimeout(timer)
  }
}
