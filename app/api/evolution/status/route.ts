import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/user'
import { getEvolutionConnectionSnapshot } from '@/lib/evolution/connection'
import { getWorkerOperationalStatus } from '@/lib/ops/worker-status'

export async function GET() {
  try {
    const { supabase } = await requireUser()
    const [evolution, worker] = await Promise.all([getEvolutionConnectionSnapshot(), getWorkerOperationalStatus(supabase)])
    return NextResponse.json({ ...evolution, worker, canProcess: evolution.state === 'CONNECTED' && worker.state === 'RUNNING' }, { headers: { 'cache-control': 'private, max-age=5' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === 'UNAUTHORIZED' ? 'UNAUTHORIZED' : 'EVOLUTION_STATUS_FAILED' }, { status: 401 })
  }
}
