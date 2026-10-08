import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/lib/supabase/user'
import { isSameOrigin } from '@/lib/security/request'

const schema = z.object({ action: z.enum(['PAUSE', 'RESUME', 'CANCEL']) })
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { if (!isSameOrigin(request)) return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 }); const { supabase, user } = await requireUser(); const { id } = await params; const parsed = schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: 'INVALID_CAMPAIGN_ACTION' }, { status: 422 }); if (parsed.data.action === 'CANCEL') { const { data, error } = await supabase.rpc('cancel_campaign', { p_campaign_id: id }); if (error) return NextResponse.json({ error: 'CAMPAIGN_UPDATE_FAILED' }, { status: 400 }); if (!data) return NextResponse.json({ error: 'CAMPAIGN_NOT_FOUND' }, { status: 404 }); return NextResponse.json({ id, status: 'CANCELLED' }) } const status = parsed.data.action === 'PAUSE' ? 'PAUSED' : 'QUEUED'; const { data, error } = await supabase.from('campaigns').update({ status }).eq('owner_id', user.id).eq('id', id).in('status', ['DRAFT', 'READY', 'QUEUED', 'RUNNING', 'PAUSED']).select('id, status').maybeSingle(); if (error) return NextResponse.json({ error: 'CAMPAIGN_UPDATE_FAILED' }, { status: 400 }); if (!data) return NextResponse.json({ error: 'CAMPAIGN_NOT_FOUND' }, { status: 404 }); return NextResponse.json(data) } catch (error) { const message = error instanceof Error && error.message === 'UNAUTHORIZED' ? error.message : 'CAMPAIGN_UPDATE_FAILED'; return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 }) }
}
