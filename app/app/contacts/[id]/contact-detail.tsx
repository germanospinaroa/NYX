'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Contact = { id: string; display_name: string; phone_e164: string; gender: string; notes: string | null; archived_at: string | null; contact_labels?: Array<{ label_id: string; labels?: { name: string; color?: string | null } | Array<{ name: string; color?: string | null }> | null }> }
type Message = { id: string; created_at: string; message_text: string; media_path?: string | null; message_type?: string | null; caption?: string | null; status: string; channel: string; sequence_id?: string | null; sequence_index?: number | null }

export function ContactDetail({ contactId }: { contactId: string }) {
  const router = useRouter()
  const [contact, setContact] = useState<Contact | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void fetch(`/api/contacts/${contactId}`).then(async (response) => {
      const body = await response.json()
      if (!response.ok) setError('Contacto no encontrado.')
      else { setContact(body.contact); setMessages(body.messages ?? []) }
    })
  }, [contactId])

  if (error) return <div className="error">{error}</div>
  if (!contact) return <p>Cargando contacto…</p>
  const currentContact = contact
  const groupedMessages = messages.reduce<Record<string, Message[]>>((groups, message) => { const key = message.sequence_id ?? message.id; (groups[key] ??= []).push(message); return groups }, {})

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSaving(true)
    const response = await fetch(`/api/contacts/${contactId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: form.get('name'), phone: form.get('phone'), gender: form.get('gender'), notes: form.get('notes'), archived: currentContact.archived_at !== null }) })
    if (!response.ok) setError('No fue posible guardar el contacto.')
    else { setContact({ ...currentContact, display_name: String(form.get('name')), phone_e164: String(form.get('phone')), gender: String(form.get('gender')), notes: String(form.get('notes') ?? '') }); setEditing(false) }
    setSaving(false)
  }

  async function archive() {
    const response = await fetch(`/api/contacts/${contactId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: currentContact.display_name, phone: currentContact.phone_e164, gender: currentContact.gender, notes: currentContact.notes, archived: !currentContact.archived_at }) })
    if (response.ok) setContact({ ...currentContact, archived_at: currentContact.archived_at ? null : new Date().toISOString() })
  }

  async function remove() {
    if (!window.confirm('Eliminar definitivamente este contacto? Esta acción no se puede deshacer.')) return
    const response = await fetch(`/api/contacts/${contactId}`, { method: 'DELETE' })
    if (response.ok) router.push('/app/contacts')
    else setError('No fue posible eliminar el contacto.')
  }

  return <div className="stack"><Link href="/app/contacts">← Contactos</Link><div className="row" style={{ justifyContent: 'space-between' }}><div><h1>{currentContact.display_name}</h1><p>{currentContact.phone_e164} · {currentContact.gender === 'MALE' ? 'Hombre' : currentContact.gender === 'FEMALE' ? 'Mujer' : 'Desconocido'}</p></div><div className="row"><Link className="button-link" href={`/app/contacts/${contactId}/message`}>Enviar mensaje</Link><button className="secondary" onClick={() => setEditing((value) => !value)}>Editar</button><button className="secondary" onClick={() => void archive()}>{currentContact.archived_at ? 'Restaurar' : 'Archivar'}</button><button className="secondary" onClick={() => void remove()}>Eliminar</button></div></div>{editing && <form className="card stack form-narrow" onSubmit={(event) => void save(event)}><label>Nombre<input name="name" defaultValue={currentContact.display_name} /></label><label>Teléfono<input name="phone" defaultValue={currentContact.phone_e164} /></label><label>Género<select name="gender" defaultValue={currentContact.gender}><option value="MALE">Hombre</option><option value="FEMALE">Mujer</option><option value="UNKNOWN">Desconocido</option></select></label><label>Nota / contexto<textarea name="notes" defaultValue={currentContact.notes ?? ''} rows={6} /></label><button disabled={saving}>Guardar</button></form>}<section className="card stack"><h2>Contexto</h2><p>{currentContact.notes || 'Todavía no hay contexto guardado.'}</p><h2>Historial de mensajes</h2>{Object.keys(groupedMessages).length ? Object.values(groupedMessages).map((sequence) => <div className="message-history-sequence" key={sequence[0].sequence_id ?? sequence[0].id}><div className="message-history-row"><span>{new Date(sequence[0].created_at).toLocaleString()}</span><strong>{sequence.every((item) => item.status === 'SENT') ? 'SENT' : sequence[0].status}</strong><p>{sequence.length} {sequence.length === 1 ? 'mensaje' : 'mensajes'}</p></div>{sequence.sort((a, b) => (a.sequence_index ?? 0) - (b.sequence_index ?? 0)).map((message) => <div className="message-history-step" key={message.id}><span>{message.message_type === 'IMAGE' ? 'Imagen' : 'Texto'}</span><p>{message.message_type === 'IMAGE' ? message.caption || 'Sin caption' : message.message_text}</p></div>)}</div>) : <p>No hay mensajes de NYX.</p>}</section></div>
}
