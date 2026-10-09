import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/user'
import { isSameOrigin } from '@/lib/security/request'
import { resolveLinkMetadata } from '@/lib/links/preview'

export async function GET(request: Request) {
  try {
    if (!isSameOrigin(request)) return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 })
    await requireUser()
    const raw = new URL(request.url).searchParams.get('url')
    if (!raw || raw.length > 2048) return NextResponse.json({ error: 'INVALID_URL' }, { status: 422 })
    const metadata = await resolveLinkMetadata(raw)
    return NextResponse.json(metadata, { headers: { 'cache-control': 'private, max-age=300' } })
  } catch (error) {
    const unauthorized = error instanceof Error && error.message === 'UNAUTHORIZED'
    if (!unauthorized) console.error('LINK_PREVIEW_FAILED', { code: error instanceof Error ? error.message : 'UNKNOWN' })
    return NextResponse.json({ error: unauthorized ? 'UNAUTHORIZED' : 'LINK_PREVIEW_FAILED' }, { status: unauthorized ? 401 : 422 })
  }
}
