import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261008170000_message_sequences.sql'), 'utf8')
const route = readFileSync(resolve(process.cwd(), 'app/api/messages/route.ts'), 'utf8')
const worker = readFileSync(resolve(process.cwd(), 'worker/outbox-worker.ts'), 'utf8')
const composer = readFileSync(resolve(process.cwd(), 'app/app/contacts/[id]/message/message-composer.tsx'), 'utf8')
const campaignComposer = readFileSync(resolve(process.cwd(), 'app/app/campaigns/new/campaign-form.tsx'), 'utf8')

describe('message sequence contract', () => {
  it('persists ordered steps in one transaction and keeps media private', () => {
    expect(migration).toContain('create table if not exists public.message_sequences')
    expect(migration).toContain('sequence_index')
    expect(migration).toContain('create or replace function public.enqueue_message_sequence')
    expect(migration).toContain('jsonb_array_elements(p_steps)')
    expect(migration).toContain('INVALID_MEDIA_OWNER')
    expect(migration).toContain("values ('nyx-media', 'nyx-media', false)")
    expect(route).toContain("rpc('enqueue_message_sequence'")
  })
  it('gates the next step on the previous SENT state', () => {
    expect(migration).toContain("previous.status = 'SENT'")
    expect(worker).toContain('refresh_message_sequence_status')
    expect(worker).toContain('createSignedUrl')
  })
  it('does not expose provider/storage infrastructure in the composer', () => {
    expect(composer).toContain('Subir imagen')
    expect(composer).toContain('+ Imagen')
    expect(composer).toContain('Revisa la secuencia antes de enviarla.')
    expect(composer).not.toContain('URL HTTPS de Storage')
    expect(composer).not.toContain('outbox')
    expect(composer).not.toContain('worker')
  })
  it('keeps campaign audio recording on the shared recorder path', () => {
    expect(campaignComposer).toContain("useAudioRecorder")
    expect(campaignComposer).toContain("'Grabar audio'")
    expect(campaignComposer).toContain("'Detener'")
    expect(campaignComposer).toContain('Boolean(audioRecorder.activeStepId)')
    expect(campaignComposer).toContain("upload(id, file, 'AUDIO')")
  })
})
