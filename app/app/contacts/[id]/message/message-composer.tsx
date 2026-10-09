'use client'
/* eslint-disable @next/next/no-img-element */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { moveStep, validateMessageSteps, type MessageStep } from '@/lib/messages/sequence'
import { validateImageFile } from '@/lib/messages/upload'
import { Icon } from '../../../ui'

type DraftStep = MessageStep & { id: string; previewUrl?: string; uploading?: boolean }
type ContactSummary = { id: string; displayName: string; phone: string; notes: string | null }
function newText(): DraftStep { return { id: crypto.randomUUID(), type: 'TEXT', text: '' } }
function newImage(): DraftStep { return { id: crypto.randomUUID(), type: 'IMAGE', caption: '' } }

export function MessageComposer({ contact }: { contact: ContactSummary }) {
  const router = useRouter()
  const [steps, setSteps] = useState<DraftStep[]>([newText()])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  function update(id: string, patch: Partial<DraftStep>) { setSteps((current) => current.map((step) => step.id === id ? { ...step, ...patch } : step)) }
  function remove(id: string) { setSteps((current) => current.length > 1 ? current.filter((step) => step.id !== id) : current) }
  function move(id: string, direction: -1 | 1) { setSteps((current) => { const index = current.findIndex((step) => step.id === id); return moveStep(current, index, direction) }) }
  async function upload(id: string, file: File) {
    const validation = validateImageFile(file)
    if (validation) { setError(validation); return }
    update(id, { uploading: true, previewUrl: URL.createObjectURL(file) })
    const form = new FormData(); form.set('file', file)
    try { const response = await fetch('/api/media/upload', { method: 'POST', body: form }); const body = await response.json().catch(() => ({})) as { path?: string }; if (!response.ok || !body.path) { setError('No fue posible subir la imagen.'); update(id, { uploading: false }); return }; update(id, { mediaPath: body.path, uploading: false }) } catch { setError('No fue posible subir la imagen.'); update(id, { uploading: false }) }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(null)
    const clean = steps.map((step) => ({ type: step.type, text: step.text, caption: step.caption, mediaPath: step.mediaPath }))
    const validation = validateMessageSteps(clean)
    if (validation) { setError(validation); return }
    setSaving(true)
    try { const response = await fetch('/api/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contactId: contact.id, steps: clean }) }); if (!response.ok) { setError('No fue posible preparar el envío.'); setSaving(false); return }; router.push('/app/contacts/' + contact.id) } catch { setError('No fue posible preparar el envío.'); setSaving(false) }
  }
  return <form className="sequence-composer" onSubmit={(event) => void submit(event)}>
    {error && <div className="inline-alert" role="alert"><Icon name="alert" size={16} />{error}</div>}
    <div className="composer-layout">
      <div className="sequence-builder">
        <div className="sequence-recipient"><span className="avatar">{contact.displayName.slice(0, 2).toUpperCase()}</span><span><strong>{contact.displayName}</strong><small>{contact.phone}</small>{contact.notes && <small>{contact.notes}</small>}</span></div>
        <div className="sequence-heading"><div><span className="eyebrow">COMPOSICIÓN</span><h2>Secuencia de mensajes</h2></div><span className="muted">{steps.length} {steps.length === 1 ? 'mensaje' : 'mensajes'}</span></div>
        <div className="sequence-timeline">{steps.map((step, index) => <article className="sequence-step" key={step.id}><div className="sequence-step-index">{index + 1}</div><div className="sequence-step-body"><div className="sequence-step-heading"><strong>{step.type === 'TEXT' ? 'Texto' : 'Imagen'}</strong><div className="row"><button type="button" className="icon-button" aria-label={`Mover paso ${index + 1} arriba`} onClick={() => move(step.id, -1)} disabled={index === 0}><Icon name="arrow-up" size={15} /></button><button type="button" className="icon-button" aria-label={`Mover paso ${index + 1} abajo`} onClick={() => move(step.id, 1)} disabled={index === steps.length - 1}><Icon name="arrow-down" size={15} /></button><button type="button" className="icon-button danger-icon" aria-label={`Eliminar paso ${index + 1}`} onClick={() => remove(step.id)} disabled={steps.length === 1}><Icon name="trash" size={15} /></button></div></div><label>Tipo<select value={step.type} onChange={(event) => update(step.id, event.target.value === 'TEXT' ? { type: 'TEXT', mediaPath: undefined, previewUrl: undefined } : { type: 'IMAGE', text: undefined })}><option value="TEXT">Texto</option><option value="IMAGE">Imagen</option></select></label>{step.type === 'TEXT' ? <label>Mensaje<textarea rows={4} value={step.text ?? ''} onChange={(event) => update(step.id, { text: event.target.value })} placeholder="Escribe el mensaje" /></label> : <><label className="upload-dropzone"><Icon name="upload" size={19} /><span><strong>Subir imagen</strong><small>JPG, PNG o WebP · hasta 8 MB</small></span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(step.id, file) }} /></label>{step.previewUrl && <img className="sequence-image-preview" src={step.previewUrl} alt="Vista previa de la imagen" />}<span className="sequence-upload-status">{step.uploading ? 'Subiendo imagen…' : step.mediaPath ? 'Imagen lista' : 'Selecciona una imagen'}</span><label>Caption opcional<textarea rows={3} value={step.caption ?? ''} onChange={(event) => update(step.id, { caption: event.target.value })} /></label></>}</div></article>)}</div>
        <div className="row sequence-add-actions"><button type="button" className="secondary" aria-label="+ Texto" onClick={() => setSteps((current) => [...current, newText()])}><Icon name="plus" size={15} />Texto</button><button type="button" className="secondary" aria-label="+ Imagen" onClick={() => setSteps((current) => [...current, newImage()])}><Icon name="plus" size={15} />Imagen</button></div>
      </div>
      <aside className="composer-preview"><span className="eyebrow">VISTA PREVIA</span><h2>Así se enviará</h2><p className="muted">Revisa el orden antes de enviar el primer mensaje.</p><div className="preview-recipient"><span className="avatar">{contact.displayName.slice(0, 2).toUpperCase()}</span><div><strong>{contact.displayName}</strong><span>{contact.phone}</span></div></div><div className="preview-sequence">{steps.map((step, index) => <div className="preview-step" key={step.id}><span>{index + 1}</span><div>{step.type === 'IMAGE' && step.previewUrl && <img className="preview-image" src={step.previewUrl} alt="Vista previa del paso" />}{step.type === 'IMAGE' && step.caption && <p>{step.caption}</p>}{step.type === 'TEXT' && <p>{step.text || 'Sin contenido todavía'}</p>}</div></div>)}</div></aside>
    </div>
    <p className="sequence-preview-copy">Revisa la secuencia antes de enviarla.</p><div className="row composer-footer"><button type="button" className="secondary" onClick={() => router.back()}>Cancelar</button><button disabled={saving || steps.some((step) => step.uploading)}>{saving ? 'Preparando…' : 'Enviar'}</button></div>
  </form>
}
