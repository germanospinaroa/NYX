import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/user'
import { isSameOrigin } from '@/lib/security/request'
import { MAX_IMAGE_BYTES, validateImageFile } from '@/lib/messages/upload'

const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 })
    const { supabase, user } = await requireUser()
    const form = await request.formData()
    const value = form.get('file')
    if (!(value instanceof File)) return NextResponse.json({ error: 'IMAGE_REQUIRED' }, { status: 422 })
    const validation = validateImageFile(value)
    if (validation || value.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: 'INVALID_IMAGE' }, { status: 422 })
    const path = `${user.id}/${crypto.randomUUID()}.${extensions[value.type]}`
    const { error } = await supabase.storage.from('nyx-media').upload(path, value, { contentType: value.type, upsert: false })
    if (error) return NextResponse.json({ error: 'IMAGE_UPLOAD_FAILED' }, { status: 400 })
    return NextResponse.json({ path }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error && error.message === 'UNAUTHORIZED' ? error.message : 'IMAGE_UPLOAD_FAILED'
    return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 })
  }
}
