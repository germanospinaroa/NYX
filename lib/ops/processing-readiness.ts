import type { SupabaseClient } from '@supabase/supabase-js'
import { getEvolutionConnectionState } from '@/lib/evolution/connection'
import { getWorkerOperationalStatus, type WorkerOperationalStatus } from '@/lib/ops/worker-status'

export type ProcessingReadiness = {
  evolutionState: Awaited<ReturnType<typeof getEvolutionConnectionState>>
  worker: WorkerOperationalStatus
  canProcess: boolean
}

export type CampaignProcessingAction = 'START' | 'PAUSE' | 'RESUME' | 'CANCEL' | 'SCHEDULE'

export function requiresProcessingReadiness(action: CampaignProcessingAction) {
  return action === 'START' || action === 'RESUME' || action === 'SCHEDULE'
}

export async function getProcessingReadiness(supabase: SupabaseClient): Promise<ProcessingReadiness> {
  const [evolutionState, worker] = await Promise.all([
    getEvolutionConnectionState(),
    getWorkerOperationalStatus(supabase),
  ])

  return { evolutionState, worker, canProcess: evolutionState === 'CONNECTED' && worker.state === 'RUNNING' }
}

export function processingBlockedReason(readiness: ProcessingReadiness) {
  if (readiness.evolutionState !== 'CONNECTED') return readiness.evolutionState === 'DISCONNECTED' ? 'EVOLUTION_DISCONNECTED' : 'EVOLUTION_STATE_UNKNOWN'
  return 'WORKER_UNVERIFIED'
}
