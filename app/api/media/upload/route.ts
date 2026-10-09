import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/user'
import { isSameOrigin } from '@/lib/security/request'
import { MAX_AUDIO_BYTES, MAX_IMAGE_BYTES, validateAudioFile, validateImageFile } from '@/lib/messages/upload'

const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3' }

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 })
    const { supabase, user } = await requireUser()
    const form = await request.formData()
    const value = form.get('file')
    const kind = form.get('kind') === 'AUDIO' ? 'AUDIO' : 'IMAGE'
    if (!(value instanceof File)) return NextResponse.json({ error: kind === 'AUDIO' ? 'AUDIO_REQUIRED' : 'IMAGE_REQUIRED' }, { status: 422 })
    const validation = kind === 'AUDIO' ? validateAudioFile(value) : validateImageFile(value)
    if (validation || value.size > (kind === 'AUDIO' ? MAX_AUDIO_BYTES : MAX_IMAGE_BYTES)) return NextResponse.json({ error: kind === 'AUDIO' ? 'INVALID_AUDIO' : 'INVALID_IMAGE' }, { status: 422 })
    const path = `${user.id}/${crypto.randomUUID()}.${extensions[value.type]}`
    const { error } = await supabase.storage.from('nyx-media').upload(path, value, { contentType: value.type, upsert: false })
    if (error) return NextResponse.json({ error: 'MEDIA_UPLOAD_FAILED' }, { status: 400 })
    return NextResponse.json({ path }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error && error.message === 'UNAUTHORIZED' ? error.message : 'MEDIA_UPLOAD_FAILED'
    return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 })
  }
}
