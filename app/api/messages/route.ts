import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/lib/supabase/user'
import { isSameOrigin } from '@/lib/security/request'

const schema = z.object({ contactId: z.string().uuid(), messageText: z.string().trim().min(1).max(10000), mediaPath: z.string().trim().url().refine((value) => value.startsWith('https://'), 'MEDIA_MUST_USE_HTTPS').optional() })
export async function POST(request: Request) {
  try { if (!isSameOrigin(request)) return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 }); const { supabase } = await requireUser(); const parsed = schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: 'INVALID_MESSAGE' }, { status: 422 }); const { data, error } = await supabase.rpc('enqueue_single_message', { p_contact_id: parsed.data.contactId, p_message_text: parsed.data.messageText, p_media_path: parsed.data.mediaPath ?? null }); if (error) return NextResponse.json({ error: error.code === 'P0002' ? 'CONTACT_NOT_FOUND' : 'MESSAGE_ENQUEUE_FAILED' }, { status: error.code === 'P0002' ? 404 : 400 }); return NextResponse.json({ id: data, status: 'QUEUED' }, { status: 201 }) } catch (error) { const message = error instanceof Error && error.message === 'UNAUTHORIZED' ? error.message : 'MESSAGE_ENQUEUE_FAILED'; return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 }) }
}
