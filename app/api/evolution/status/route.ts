import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/user'
import { getEvolutionConnectionState } from '@/lib/evolution/connection'

export async function GET() {
  try {
    await requireUser()
    return NextResponse.json({ state: await getEvolutionConnectionState() }, { headers: { 'cache-control': 'private, max-age=5' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === 'UNAUTHORIZED' ? 'UNAUTHORIZED' : 'EVOLUTION_STATUS_FAILED' }, { status: 401 })
  }
}
