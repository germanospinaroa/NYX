import type { SupabaseClient } from '@supabase/supabase-js'

export type WorkerHeartbeat = {
  worker_id: string
  status: 'RUNNING' | 'ERROR'
  last_seen_at: string
}

export type WorkerOperationalStatus = {
  state: 'RUNNING' | 'STALE' | 'UNKNOWN'
  lastSeenAt: string | null
  workerCount: number
}

const HEARTBEAT_MAX_AGE_MS = 30_000

export async function getWorkerOperationalStatus(supabase: SupabaseClient): Promise<WorkerOperationalStatus> {
  const { data, error } = await supabase
    .from('worker_heartbeats')
    .select('worker_id, status, last_seen_at')
    .order('last_seen_at', { ascending: false })

  if (error) return { state: 'UNKNOWN', lastSeenAt: null, workerCount: 0 }

  const rows = (data ?? []) as WorkerHeartbeat[]
  const lastSeenAt = rows[0]?.last_seen_at ?? null
  const running = rows.filter((row) => row.status === 'RUNNING' && Date.now() - new Date(row.last_seen_at).getTime() <= HEARTBEAT_MAX_AGE_MS)
  if (running.length === 1) return { state: 'RUNNING', lastSeenAt, workerCount: 1 }
  if (running.length > 1) return { state: 'STALE', lastSeenAt, workerCount: running.length }
  if (rows.length) return { state: 'STALE', lastSeenAt, workerCount: 0 }
  return { state: 'UNKNOWN', lastSeenAt: null, workerCount: 0 }
}
