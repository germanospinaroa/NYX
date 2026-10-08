import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/user'
import { isSameOrigin } from '@/lib/security/request'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!isSameOrigin(request)) return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 })
    const { supabase } = await requireUser()
    const { id } = await params
    const { data, error } = await supabase.rpc('finalize_contact_import', { p_import_id: id }).single()
    if (error) return NextResponse.json({ error: error.message === 'IMPORT_REVIEW_REQUIRED' ? 'IMPORT_REVIEW_REQUIRED' : 'IMPORT_FINALIZE_FAILED' }, { status: 400 })
    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error && error.message === 'UNAUTHORIZED' ? error.message : 'IMPORT_FINALIZE_FAILED'
    return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 })
  }
}
