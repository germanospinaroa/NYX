'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConversationPreview } from '@/app/app/messages/conversation-preview'
import { moveStep, validateMessageSteps, type MessageStep } from '@/lib/messages/sequence'
import { validateAudioFile, validateImageFile } from '@/lib/messages/upload'
import { insertTemplateVariable, type CampaignVariableToken } from '@/lib/campaigns/variables'
import { resolveIndividualMessageSteps } from '@/lib/messages/personalization'
import { useAudioRecorder } from '@/lib/messages/use-audio-recorder'
import { Icon } from '../../../ui'

type DraftStep = MessageStep & { id: string; previewUrl?: string; uploading?: boolean; recording?: boolean }
type ContactSummary = { id: string; displayName: string; firstName: string; phone: string; notes: string | null }
const newText = (): DraftStep => ({ id: crypto.randomUUID(), type: 'TEXT', text: '' })
const newImage = (): DraftStep => ({ id: crypto.randomUUID(), type: 'IMAGE', caption: '' })
const newAudio = (): DraftStep => ({ id: crypto.randomUUID(), type: 'AUDIO' })

export function MessageComposer({ contact }: { contact: ContactSummary }) {
  const router = useRouter()
  const [steps, setSteps] = useState<DraftStep[]>([newText()])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const objectUrls = useRef<string[]>([])
  const textareas = useRef<Record<string, HTMLTextAreaElement | null>>({})
  useEffect(() => () => { objectUrls.current.forEach((url) => URL.revokeObjectURL(url)) }, [])
  const update = (id: string, patch: Partial<DraftStep>) => setSteps((current) => current.map((step) => step.id === id ? { ...step, ...patch } : step))
  const remove = (id: string) => { if (audioRecorder.activeStepId === id) audioRecorder.cancel(); setSteps((current) => current.length > 1 ? current.filter((step) => step.id !== id) : current) }
  const move = (id: string, direction: -1 | 1) => setSteps((current) => moveStep(current, current.findIndex((step) => step.id === id), direction))
  const registerTextarea = (key: string, node: HTMLTextAreaElement | null) => { textareas.current[key] = node }
  function insertVariable(stepId: string, field: 'text' | 'caption', variable: CampaignVariableToken) {
    const key = `${stepId}:${field}`
    const input = textareas.current[key]
    const currentValue = input?.value ?? ''
    const result = insertTemplateVariable(currentValue, input?.selectionStart ?? currentValue.length, input?.selectionEnd ?? currentValue.length, variable)
    update(stepId, { [field]: result.value })
    requestAnimationFrame(() => { const next = textareas.current[key]; next?.focus(); next?.setSelectionRange(result.cursor, result.cursor) })
  }
  async function upload(id: string, file: File, kind: 'IMAGE' | 'AUDIO') {
    const validation = kind === 'IMAGE' ? validateImageFile(file) : validateAudioFile(file)
    if (validation) { setError(validation); return }
    const previewUrl = URL.createObjectURL(file); objectUrls.current.push(previewUrl); update(id, { uploading: true, previewUrl, mimeType: file.type })
    const form = new FormData(); form.set('file', file); form.set('kind', kind)
    try { const response = await fetch('/api/media/upload', { method: 'POST', body: form }); const body = await response.json().catch(() => ({})) as { path?: string }; if (!response.ok || !body.path) throw new Error(); update(id, { mediaPath: body.path, uploading: false }) } catch { update(id, { uploading: false }); setError(`No fue posible subir ${kind === 'IMAGE' ? 'la imagen' : 'el audio'}.`) }
  }
  const audioRecorder = useAudioRecorder((id, file) => { update(id, { recording: false }); void upload(id, file, 'AUDIO') })
  async function record(id: string) {
    try { await audioRecorder.start(id); update(id, { recording: true }) }
    catch (recordError) { setError(recordError instanceof Error && recordError.message === 'UNSUPPORTED_AUDIO' ? 'Tu navegador no permite grabar audio aquí. Puedes subir un audio.' : 'No pudimos acceder al micrófono. Revisa el permiso o sube un audio.') }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(null)
    const clean = steps.map(({ id, previewUrl, uploading, recording, ...step }) => step); const validation = validateMessageSteps(clean)
    if (validation) { setError(validation); return }
    setSaving(true)
    try { const response = await fetch('/api/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contactId: contact.id, steps: clean }) }); if (!response.ok) { const body = await response.json().catch(() => ({})) as { error?: string }; throw new Error(body.error) } router.push(`/app/contacts/${contact.id}`) } catch (submitError) { const code = submitError instanceof Error ? submitError.message : ''; setError(code === 'VARIABLE_NO_COMPATIBLE' ? 'Esta variable todavía no está disponible.' : code === 'MISSING_RECIPIENT_NAME' ? 'Falta el nombre de este contacto.' : 'No fue posible preparar el envío.'); setSaving(false) }
  }
  const previewSteps = steps.map((step) => {
    const resolved = resolveIndividualMessageSteps([step], { firstNameSnapshot: contact.firstName, displayNameSnapshot: contact.displayName }).steps[0]
    return resolved ?? step
  })
  return <form className="sequence-composer" onSubmit={(event) => void submit(event)}>
    {error && <div className="inline-alert" role="alert"><Icon name="alert" size={16} />{error}</div>}
    <div className="composer-layout"><div className="sequence-builder">
      <div className="sequence-recipient"><span className="avatar">{contact.displayName.slice(0, 2).toUpperCase()}</span><span><strong>{contact.displayName}</strong><small>{contact.phone}</small>{contact.notes && <small>{contact.notes}</small>}</span></div>
      <div className="sequence-heading"><div><span className="eyebrow">COMPOSICIÓN</span><h2>Secuencia de mensajes</h2></div><span className="muted">{steps.length} {steps.length === 1 ? 'mensaje' : 'mensajes'}</span></div>
      <div className="sequence-timeline">{steps.map((step, index) => <article className="sequence-step" key={step.id}><div className="sequence-step-index">{index + 1}</div><div className="sequence-step-body"><div className="sequence-step-heading"><strong>{step.type === 'TEXT' ? 'Texto' : step.type === 'IMAGE' ? 'Imagen' : 'Audio'}</strong><div className="row"><button type="button" className="icon-button" aria-label="Mover arriba" onClick={() => move(step.id, -1)} disabled={index === 0}><Icon name="arrow-up" size={15} /></button><button type="button" className="icon-button" aria-label="Mover abajo" onClick={() => move(step.id, 1)} disabled={index === steps.length - 1}><Icon name="arrow-down" size={15} /></button><button type="button" className="icon-button danger-icon" aria-label="Eliminar paso" onClick={() => remove(step.id)} disabled={steps.length === 1}><Icon name="trash" size={15} /></button></div></div>
        {step.type === 'TEXT' ? <label>Mensaje<textarea rows={5} value={step.text ?? ''} onChange={(event) => update(step.id, { text: event.target.value })} placeholder="Escribe el mensaje" ref={(node) => registerTextarea(`${step.id}:text`, node)} /><VariableActions onInsert={(variable) => insertVariable(step.id, 'text', variable)} /></label> : <><label className="upload-dropzone"><Icon name="upload" size={19} /><span><strong>{step.type === 'IMAGE' ? 'Subir imagen' : 'Subir audio'}</strong><small>{step.type === 'IMAGE' ? 'JPG, PNG o WebP · hasta 8 MB' : 'WebM, OGG, MP4 o MP3 · hasta 16 MB'}</small></span><input type="file" accept={step.type === 'IMAGE' ? 'image/jpeg,image/png,image/webp' : 'audio/webm,audio/ogg,audio/mp4,audio/mpeg'} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(step.id, file, step.type === 'IMAGE' ? 'IMAGE' : 'AUDIO') }} /></label>{step.type === 'AUDIO' && <button type="button" className="secondary" onClick={() => step.recording ? audioRecorder.stop() : void record(step.id)}>{step.recording ? 'Detener' : 'Grabar audio'}</button>}{step.recording && <span role="status" aria-live="polite">Grabando…</span>}{step.previewUrl && (step.type === 'IMAGE' ? <img className="sequence-image-preview" src={step.previewUrl} alt="Vista previa de imagen" /> : <audio controls src={step.previewUrl} aria-label="Vista previa del audio" />)}<span className="sequence-upload-status">{step.uploading ? 'Subiendo…' : step.mediaPath ? 'Archivo listo' : 'Selecciona un archivo'}</span>{step.type === 'IMAGE' && <label>Caption opcional<textarea rows={3} value={step.caption ?? ''} onChange={(event) => update(step.id, { caption: event.target.value })} ref={(node) => registerTextarea(`${step.id}:caption`, node)} /><VariableActions onInsert={(variable) => insertVariable(step.id, 'caption', variable)} /></label>}</>}
      </div></article>)}</div>
      <div className="row sequence-add-actions"><button type="button" className="secondary" aria-label="+ Texto" onClick={() => setSteps((current) => [...current, newText()])}><Icon name="plus" size={15} />Texto</button><button type="button" className="secondary" aria-label="+ Imagen" onClick={() => setSteps((current) => [...current, newImage()])}><Icon name="plus" size={15} />Imagen</button><button type="button" className="secondary" aria-label="+ Audio" onClick={() => setSteps((current) => [...current, newAudio()])}><Icon name="plus" size={15} />Audio</button></div>
    </div><aside className="composer-preview"><ConversationPreview steps={previewSteps} recipient={{ name: contact.displayName, phone: contact.phone }} /></aside></div>
    <p className="sequence-preview-copy">Revisa la secuencia antes de enviarla.</p><div className="row composer-footer"><button type="button" className="secondary" onClick={() => router.back()}>Cancelar</button><button disabled={saving || Boolean(audioRecorder.activeStepId) || steps.some((step) => step.uploading)}>{saving ? 'Preparando…' : 'Enviar'}</button></div>
  </form>
}

function VariableActions({ onInsert }: { onInsert: (variable: CampaignVariableToken) => void }) {
  return <span className="row variable-actions"><button type="button" className="secondary" onClick={() => onInsert('{{nombre}}')}>Insertar nombre</button><button type="button" className="secondary" onClick={() => onInsert('{{nombre_completo}}')}>Insertar nombre completo</button></span>
}
