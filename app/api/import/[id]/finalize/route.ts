import { NextResponse } from 'next/server'
import { finalizeErrorStatus, getFinalizeDomainError } from '@/lib/imports/finalize-errors'
import { requireUser } from '@/lib/supabase/user'
import { isSameOrigin } from '@/lib/security/request'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const correlationId = crypto.randomUUID()
  let id = 'unknown'
  try {
    ({ id } = await params)
    if (!isSameOrigin(request)) return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 })
    const { supabase } = await requireUser()
    const { data, error } = await supabase.rpc('finalize_contact_import', { p_import_id: id }).single()
    if (error) {
      const domainError = getFinalizeDomainError(error)
      const errorCode = domainError ?? 'IMPORT_FINALIZE_FAILED'
      console.error('[NYX_FINALIZE_ERROR]', { correlationId, importId: id, errorCode })
      return NextResponse.json({ error: errorCode, errorCode: correlationId }, { status: domainError ? finalizeErrorStatus(domainError) : 500 })
    }
    return NextResponse.json(data)
  } catch (error) {
    const unauthorized = error instanceof Error && error.message === 'UNAUTHORIZED'
    if (!unauthorized) console.error('[NYX_FINALIZE_ERROR]', { correlationId, importId: id, errorCode: 'IMPORT_FINALIZE_FAILED' })
    return NextResponse.json({ error: unauthorized ? 'UNAUTHORIZED' : 'IMPORT_FINALIZE_FAILED', errorCode: correlationId }, { status: unauthorized ? 401 : 500 })
  }
}
