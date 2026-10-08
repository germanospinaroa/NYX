import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/lib/supabase/user'
import { isSameOrigin } from '@/lib/security/request'

const schema = z.object({ action: z.enum(['START', 'PAUSE', 'RESUME', 'CANCEL']) })
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { if (!isSameOrigin(request)) return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 }); const { supabase } = await requireUser(); const { id } = await params; const parsed = schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: 'INVALID_CAMPAIGN_ACTION' }, { status: 422 }); const rpc = parsed.data.action === 'START' ? 'queue_campaign' : parsed.data.action === 'PAUSE' ? 'pause_campaign' : parsed.data.action === 'RESUME' ? 'resume_campaign' : 'cancel_campaign'; const { data, error } = await supabase.rpc(rpc, { p_campaign_id: id }); if (error) return NextResponse.json({ error: 'CAMPAIGN_UPDATE_FAILED' }, { status: 400 }); if (!data) return NextResponse.json({ error: 'CAMPAIGN_NOT_FOUND' }, { status: 404 }); const status = parsed.data.action === 'START' || parsed.data.action === 'RESUME' ? 'QUEUED' : parsed.data.action === 'PAUSE' ? 'PAUSED' : 'CANCELLED'; return NextResponse.json({ id, status }) } catch (error) { const message = error instanceof Error && error.message === 'UNAUTHORIZED' ? error.message : 'CAMPAIGN_UPDATE_FAILED'; return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 }) }
}
