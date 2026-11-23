export type EvolutionConnectionState = 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING' | 'ERROR' | 'UNKNOWN'

export type EvolutionConnectionSnapshot = {
  state: EvolutionConnectionState
  instance: string | null
  linkedNumber: string | null
  checkedAt: string
}

type ConnectionResponse = { instance?: { instanceName?: unknown; state?: unknown; status?: unknown; owner?: unknown; profileName?: unknown } }

export async function getEvolutionConnectionSnapshot(): Promise<EvolutionConnectionSnapshot> {
  const checkedAt = new Date().toISOString()
  const baseUrl = process.env.EVOLUTION_BASE_URL?.replace(/\/$/u, '')
  const apiKey = process.env.EVOLUTION_API_KEY
  const instance = process.env.EVOLUTION_INSTANCE
  if (!baseUrl || !apiKey || !instance) return { state: 'ERROR', instance: instance || null, linkedNumber: null, checkedAt }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Number(process.env.EVOLUTION_HEALTH_TIMEOUT_MS ?? 5000))
  try {
    const response = await fetch(`${baseUrl}/instance/connectionState/${encodeURIComponent(instance)}`, {
      headers: { apikey: apiKey, accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!response.ok) return { state: 'ERROR', instance, linkedNumber: null, checkedAt }
    const body = await response.json().catch(() => null) as ConnectionResponse | null
    const state = String(body?.instance?.state ?? body?.instance?.status ?? '').toLowerCase()
    const linkedNumber = maskLinkedNumber(body?.instance?.owner)
    if (state === 'open' || state === 'connected') return { state: 'CONNECTED', instance, linkedNumber, checkedAt }
    if (state === 'close' || state === 'closed' || state === 'disconnected') return { state: 'DISCONNECTED', instance, linkedNumber, checkedAt }
    if (state === 'connecting' || state === 'qr') return { state: 'CONNECTING', instance, linkedNumber, checkedAt }
    return { state: 'ERROR', instance, linkedNumber, checkedAt }
  } catch {
    return { state: 'ERROR', instance, linkedNumber: null, checkedAt }
  } finally {
    clearTimeout(timer)
  }
}

export async function getEvolutionConnectionState(): Promise<'CONNECTED' | 'DISCONNECTED' | 'UNKNOWN'> {
  const snapshot = await getEvolutionConnectionSnapshot()
  if (snapshot.state === 'CONNECTED') return 'CONNECTED'
  if (snapshot.state === 'DISCONNECTED') return 'DISCONNECTED'
  return 'UNKNOWN'
}

function maskLinkedNumber(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const digits = value.replace(/\D/g, '')
  if (digits.length < 4) return null
  return `••••${digits.slice(-4)}`
}
