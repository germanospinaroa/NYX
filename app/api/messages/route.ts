import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/lib/supabase/user'
import { isSameOrigin } from '@/lib/security/request'

const stepSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('TEXT'), text: z.string().trim().min(1).max(10000), caption: z.string().max(10000).optional(), mediaPath: z.undefined().optional() }),
  z.object({ type: z.literal('IMAGE'), text: z.string().max(1).optional(), caption: z.string().max(10000).optional(), mediaPath: z.string().trim().min(1).max(500) }),
])
const schema = z.object({ contactId: z.string().uuid(), steps: z.array(stepSchema).min(1).max(50) })
export async function POST(request: Request) {
  try { if (!isSameOrigin(request)) return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 }); const { supabase } = await requireUser(); const parsed = schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: 'INVALID_MESSAGE' }, { status: 422 }); const { data, error } = await supabase.rpc('enqueue_message_sequence', { p_contact_id: parsed.data.contactId, p_steps: parsed.data.steps }); if (error) { console.error('MESSAGE_SEQUENCE_RPC_FAILED', { code: error.code ?? 'UNKNOWN' }); return NextResponse.json({ error: error.code === 'P0002' ? 'CONTACT_NOT_FOUND' : 'MESSAGE_SEQUENCE_FAILED' }, { status: error.code === 'P0002' ? 404 : 400 }) } return NextResponse.json({ id: data, status: 'QUEUED', steps: parsed.data.steps.length }, { status: 201 }) } catch (error) { const message = error instanceof Error && error.message === 'UNAUTHORIZED' ? error.message : 'MESSAGE_SEQUENCE_FAILED'; if (message !== 'UNAUTHORIZED') console.error('MESSAGE_SEQUENCE_ROUTE_FAILED', { code: error instanceof Error ? error.name : 'UNKNOWN' }); return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 }) }
}
