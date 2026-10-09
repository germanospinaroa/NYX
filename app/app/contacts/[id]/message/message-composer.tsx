'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { moveStep, validateMessageSteps, type MessageStep } from '@/lib/messages/sequence'
import { validateImageFile } from '@/lib/messages/upload'

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
    const form = new FormData()
    form.set('file', file)
    try {
      const response = await fetch('/api/media/upload', { method: 'POST', body: form })
      const body = await response.json().catch(() => ({})) as { path?: string }
      if (!response.ok || !body.path) { setError('No fue posible subir la imagen.'); update(id, { uploading: false }); return }
      update(id, { mediaPath: body.path, uploading: false })
    } catch { setError('No fue posible subir la imagen.'); update(id, { uploading: false }) }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    const clean = steps.map((step) => ({ type: step.type, text: step.text, caption: step.caption, mediaPath: step.mediaPath }))
    const validation = validateMessageSteps(clean)
    if (validation) { setError(validation); return }
    setSaving(true)
    try {
      const response = await fetch('/api/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contactId: contact.id, steps: clean }) })
      if (!response.ok) { setError('No fue posible preparar el envío.'); setSaving(false); return }
      router.push('/app/contacts/' + contact.id)
    } catch { setError('No fue posible preparar el envío.'); setSaving(false) }
  }

  return <form className="card stack sequence-composer" onSubmit={(event) => void submit(event)}>
    {error && <div className="error" role="alert">{error}</div>}
    <div className="sequence-recipient"><strong>{contact.displayName}</strong><span>{contact.phone}</span>{contact.notes && <small>{contact.notes}</small>}</div>
    <div className="sequence-heading"><h2>Secuencia de mensajes</h2><span>{steps.length} {steps.length === 1 ? 'mensaje' : 'mensajes'}</span></div>
    {steps.map((step, index) => <article className="sequence-step" key={step.id}>
      <div className="sequence-step-heading"><strong>Paso {index + 1}</strong><div className="row"><button type="button" className="secondary compact-button" onClick={() => move(step.id, -1)} disabled={index === 0}>↑</button><button type="button" className="secondary compact-button" onClick={() => move(step.id, 1)} disabled={index === steps.length - 1}>↓</button><button type="button" className="secondary compact-button" onClick={() => remove(step.id)} disabled={steps.length === 1}>Eliminar</button></div></div>
      <label>Tipo<select value={step.type} onChange={(event) => update(step.id, event.target.value === 'TEXT' ? { type: 'TEXT', mediaPath: undefined, previewUrl: undefined } : { type: 'IMAGE', text: undefined })}><option value="TEXT">Texto</option><option value="IMAGE">Imagen</option></select></label>
      {step.type === 'TEXT' ? <label>Mensaje<textarea rows={4} value={step.text ?? ''} onChange={(event) => update(step.id, { text: event.target.value })} placeholder="Escribe el mensaje" /></label> : <>
        <label>Subir imagen<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(step.id, file) }} /></label>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {step.previewUrl && <img className="sequence-image-preview" src={step.previewUrl} alt="Vista previa de la imagen" />}
        <span className="sequence-upload-status">{step.uploading ? 'Subiendo imagen…' : step.mediaPath ? 'Imagen lista' : 'Selecciona una imagen'}</span>
        <label>Caption opcional<textarea rows={3} value={step.caption ?? ''} onChange={(event) => update(step.id, { caption: event.target.value })} /></label>
      </>}
    </article>)}
    <div className="row"><button type="button" className="secondary" onClick={() => setSteps((current) => [...current, newText()])}>+ Texto</button><button type="button" className="secondary" onClick={() => setSteps((current) => [...current, newImage()])}>+ Imagen</button></div>
    <p className="sequence-preview-copy">Revisa la secuencia antes de enviarla.</p>
    <div className="row"><button type="button" className="secondary" onClick={() => router.back()}>Cancelar</button><button disabled={saving || steps.some((step) => step.uploading)}>{saving ? 'Preparando…' : 'Enviar'}</button></div>
  </form>
}
