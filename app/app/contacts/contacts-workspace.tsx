'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { selectionCount, selectionIncludes, type ContactSelection, type SerializedContactSelection } from '@/lib/contacts/selection'

type Label = { id: string; name: string; color?: string | null }
type ContactLabel = { label_id: string; labels?: Label | Label[] | null }
type Contact = { id: string; display_name: string; first_name: string; phone_e164: string; gender: string | null; contact_labels?: ContactLabel[] }

const PAGE_SIZE = 50

export function ContactsWorkspace() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [labels, setLabels] = useState<Label[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [query, setQuery] = useState('')
  const [gender, setGender] = useState('')
  const [labelId, setLabelId] = useState('')
  const [selection, setSelection] = useState<ContactSelection | null>(null)
  const [bulkLabelId, setBulkLabelId] = useState('')
  const [showLabelForm, setShowLabelForm] = useState(false)
  const [newLabelName, setNewLabelName] = useState('')
  const [newLabelColor, setNewLabelColor] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const requestSequence = useRef(0)

  const filtersActive = Boolean(query.trim() || gender || labelId)
  const filterSelection = useMemo(() => ({ mode: 'filter' as const, q: query.trim(), gender, labelId, excludeIds: new Set<string>() }), [gender, labelId, query])
  const selectedCount = selectionCount(selection, total)
  const pageIds = useMemo(() => contacts.map((contact) => contact.id), [contacts])
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectionIncludes(selection, id))
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const requestId = ++requestSequence.current
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), q: query, gender, labelId })
    try {
      const [contactsResponse, labelsResponse] = await Promise.all([fetch(`/api/contacts?${params}`), fetch('/api/labels')])
      const contactsBody = await contactsResponse.json().catch(() => ({})) as { contacts?: Contact[]; total?: number }
      const labelsBody = await labelsResponse.json().catch(() => ({})) as { labels?: Label[] }
      if (requestId !== requestSequence.current) return
      if (!contactsResponse.ok) setError('No fue posible cargar los contactos.')
      else { setContacts(contactsBody.contacts ?? []); setTotal(contactsBody.total ?? 0) }
      if (labelsResponse.ok) setLabels(labelsBody.labels ?? [])
    } catch {
      if (requestId === requestSequence.current) setError('No fue posible cargar los contactos.')
    } finally {
      if (requestId === requestSequence.current) setLoading(false)
    }
  }, [gender, labelId, page, query])

  // Server-side filters and pagination are the source of truth for this workspace.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  function resetFilters(next: { query?: string; gender?: string; labelId?: string } = {}) {
    setQuery(next.query ?? '')
    setGender(next.gender ?? '')
    setLabelId(next.labelId ?? '')
    setPage(0)
    setSelection(null)
  }

  function toggleContact(contactId: string) {
    setSelection((current) => {
      if (current?.mode === 'filter') {
        const excludeIds = new Set(current.excludeIds)
        if (excludeIds.has(contactId)) excludeIds.delete(contactId)
        else excludeIds.add(contactId)
        return { ...current, excludeIds }
      }
      const ids = new Set(current?.mode === 'ids' ? current.ids : [])
      if (ids.has(contactId)) ids.delete(contactId)
      else ids.add(contactId)
      return ids.size ? { mode: 'ids', ids } : null
    })
  }

  function togglePage() {
    setSelection((current) => {
      if (current?.mode === 'filter') {
        const excludeIds = new Set(current.excludeIds)
        pageIds.forEach((id) => { if (allPageSelected) excludeIds.add(id); else excludeIds.delete(id) })
        return { ...current, excludeIds }
      }
      const ids = new Set(current?.mode === 'ids' ? current.ids : [])
      pageIds.forEach((id) => { if (allPageSelected) ids.delete(id); else ids.add(id) })
      return ids.size ? { mode: 'ids', ids } : null
    })
  }

  function selectAllFiltered() {
    if (!total) return
    setSelection({ ...filterSelection, total })
  }

  function serializedSelection(): SerializedContactSelection | null {
    if (!selection) return null
    if (selection.mode === 'ids') return { mode: 'ids', contactIds: [...selection.ids] }
    return { mode: 'filter', q: selection.q, gender: selection.gender, labelId: selection.labelId || undefined, excludeIds: [...selection.excludeIds] }
  }

  function updateVisibleLabels(action: 'ADD' | 'REMOVE', targetLabelId: string, targetSelection: ContactSelection | string) {
    setContacts((current) => current.map((contact) => {
      const selected = typeof targetSelection === 'string' ? contact.id === targetSelection : selectionIncludes(targetSelection, contact.id)
      if (!selected) return contact
      const existing = contact.contact_labels ?? []
      if (action === 'REMOVE') return { ...contact, contact_labels: existing.filter((entry) => entry.label_id !== targetLabelId) }
      if (existing.some((entry) => entry.label_id === targetLabelId)) return contact
      return { ...contact, contact_labels: [...existing, { label_id: targetLabelId, labels: labels.find((label) => label.id === targetLabelId) }] }
    }))
  }

  function updateVisibleGender(value: string) {
    setContacts((current) => current.map((contact) => selectionIncludes(selection, contact.id) ? { ...contact, gender: value } : contact))
  }

  async function labelAction(action: 'ADD' | 'REMOVE', targetLabelId = bulkLabelId, targetSelection: ContactSelection | string | null = selection) {
    if (!targetLabelId || !targetSelection) return
    const serialized = typeof targetSelection === 'string' ? { mode: 'ids' as const, contactIds: [targetSelection] } : targetSelection === selection ? serializedSelection() : null
    if (!serialized) return
    setLoading(true); setError(null); setMessage(null)
    try {
      const response = await fetch('/api/contacts/labels', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ selection: serialized, labelId: targetLabelId, action }) })
      if (!response.ok) setError('No fue posible actualizar las etiquetas.')
      else { updateVisibleLabels(action, targetLabelId, targetSelection); setMessage(`${action === 'ADD' ? 'Etiqueta aplicada' : 'Etiqueta quitada'} a ${typeof targetSelection === 'string' ? 1 : selectionCount(targetSelection, total)} contactos.`); setSelection(null) }
    } catch {
      setError('No fue posible actualizar las etiquetas.')
    } finally {
      setLoading(false)
    }
  }

  async function updateGender(value: string) {
    const serialized = serializedSelection()
    if (!value || !serialized) return
    setLoading(true); setError(null); setMessage(null)
    try {
      const response = await fetch('/api/contacts/gender', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ selection: serialized, gender: value }) })
      if (!response.ok) setError('No fue posible actualizar el género.')
      else { updateVisibleGender(value); setMessage(`Género actualizado en ${selectedCount} contactos.`); setSelection(null) }
    } catch {
      setError('No fue posible actualizar el género.')
    } finally {
      setLoading(false)
    }
  }

  async function createLabel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!newLabelName.trim()) return
    setLoading(true); setError(null); setMessage(null)
    try {
      const response = await fetch('/api/labels', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: newLabelName.trim(), color: newLabelColor.trim() || undefined }) })
      const body = await response.json().catch(() => ({})) as Label
      if (!response.ok) setError('No fue posible crear la etiqueta. Revisa el nombre y color.')
      else { setLabels((current) => [...current, body].sort((a, b) => a.name.localeCompare(b.name))); setNewLabelName(''); setNewLabelColor(''); setShowLabelForm(false); setMessage('Etiqueta creada.') }
    } catch {
      setError('No fue posible crear la etiqueta.')
    } finally {
      setLoading(false)
    }
  }

  return <div className="contacts-workspace stack">
    {error && <div className="error" role="alert">{error}</div>}
    {message && <div className="success" role="status">{message}</div>}
    <div className="card stack">
      <div className="contacts-filter-bar">
        <input className="contacts-search" placeholder="Buscar por nombre o teléfono" value={query} onChange={(event) => resetFilters({ query: event.target.value, gender, labelId })} />
        <select value={gender} aria-label="Filtrar por género" onChange={(event) => resetFilters({ query, gender: event.target.value, labelId })}><option value="">Todos</option><option value="MALE">Hombre</option><option value="FEMALE">Mujer</option><option value="UNKNOWN">Desconocido</option></select>
        <select value={labelId} aria-label="Filtrar por etiqueta" onChange={(event) => resetFilters({ query, gender, labelId: event.target.value })}><option value="">Todas las etiquetas</option>{labels.map((label) => <option key={label.id} value={label.id}>{label.name}</option>)}</select>
        <button className="secondary" onClick={() => setShowLabelForm((value) => !value)}>{showLabelForm ? 'Cerrar' : 'Nueva etiqueta'}</button>
      </div>
      {showLabelForm && <form className="label-create-form" onSubmit={(event) => void createLabel(event)}><input placeholder="Nombre de etiqueta" value={newLabelName} onChange={(event) => setNewLabelName(event.target.value)} maxLength={80} required /><input placeholder="Color opcional (#RRGGBB)" value={newLabelColor} onChange={(event) => setNewLabelColor(event.target.value)} maxLength={7} /><button disabled={loading}>Crear etiqueta</button></form>}
      <div className="contacts-bulk-bar">
        <button className="secondary" onClick={togglePage} disabled={!contacts.length || loading}>{allPageSelected ? 'Quitar selección de página' : 'Seleccionar página'}</button>
        {total > contacts.length && selection?.mode !== 'filter' && <button className="secondary" onClick={selectAllFiltered} disabled={loading}>Seleccionar los {total} resultados</button>}
        {selection?.mode === 'filter' && <button className="secondary" onClick={() => setSelection(null)}>Quitar selección total</button>}
        <span className="selection-count">{selectedCount} seleccionados</span>
        <select value={bulkLabelId} onChange={(event) => setBulkLabelId(event.target.value)} aria-label="Etiqueta para selección"><option value="">Etiqueta…</option>{labels.map((label) => <option key={label.id} value={label.id}>{label.name}</option>)}</select>
        <button onClick={() => void labelAction('ADD')} disabled={loading || !selectedCount || !bulkLabelId}>Asignar label</button>
        <button className="secondary" onClick={() => void labelAction('REMOVE')} disabled={loading || !selectedCount || !bulkLabelId}>Quitar label</button>
        <select defaultValue="" onChange={(event) => void updateGender(event.target.value)} disabled={!selectedCount || loading} aria-label="Cambiar género"><option value="">Cambiar género…</option><option value="MALE">Hombre</option><option value="FEMALE">Mujer</option><option value="UNKNOWN">Desconocido</option></select>
        <button className="secondary" disabled title="Disponible en una fase futura">Crear campaña</button>
      </div>
    </div>
    <div className="contacts-result-heading"><strong>{filtersActive ? `${total} contactos coinciden` : `${total} contactos`}</strong><span>{loading ? 'Actualizando…' : 'Filtros y resultados en servidor'}</span></div>
    <div className="card table-scroll contacts-table-wrap"><table className="contacts-table"><thead><tr><th><input type="checkbox" checked={allPageSelected} onChange={togglePage} aria-label="Seleccionar página" /></th><th>Nombre</th><th>Teléfono</th><th>Género</th><th>Labels</th><th>Acciones</th></tr></thead><tbody>{contacts.map((contact) => <ContactTableRow key={contact.id} contact={contact} labels={labels} selected={selectionIncludes(selection, contact.id)} onToggle={() => toggleContact(contact.id)} onLabelAction={(action, id) => void labelAction(action, id, contact.id)} />)}{contacts.length === 0 && <tr><td colSpan={6}>No hay contactos con estos filtros.</td></tr>}</tbody></table></div>
    <div className="contacts-mobile-list">{contacts.map((contact) => <ContactCard key={contact.id} contact={contact} labels={labels} selected={selectionIncludes(selection, contact.id)} onToggle={() => toggleContact(contact.id)} onLabelAction={(action, id) => void labelAction(action, id, contact.id)} />)}{contacts.length === 0 && <div className="card">No hay contactos con estos filtros.</div>}</div>
    <div className="row contacts-pagination" style={{ justifyContent: 'space-between' }}><span>Página {page + 1} de {totalPages}</span><div className="row"><button className="secondary" disabled={page === 0 || loading} onClick={() => setPage((value) => value - 1)}>Anterior</button><button className="secondary" disabled={page + 1 >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>Siguiente</button></div></div>
  </div>
}

function getLabel(entry: ContactLabel, labels: Label[]) {
  const nested = Array.isArray(entry.labels) ? entry.labels[0] : entry.labels
  return nested ?? labels.find((label) => label.id === entry.label_id)
}

function ContactLabels({ contact, labels, onLabelAction }: { contact: Contact; labels: Label[]; onLabelAction: (action: 'ADD' | 'REMOVE', labelId: string) => void }) {
  return <div className="contact-labels"><div className="contact-label-chips">{(contact.contact_labels ?? []).map((entry) => { const label = getLabel(entry, labels); return label ? <button className="label-chip" key={entry.label_id} style={label.color ? { borderColor: label.color } : undefined} title={`Quitar ${label.name}`} onClick={() => onLabelAction('REMOVE', entry.label_id)}>{label.name} ×</button> : null })}</div><select defaultValue="" aria-label={`Agregar etiqueta a ${contact.display_name}`} onChange={(event) => { if (event.target.value) { onLabelAction('ADD', event.target.value); event.currentTarget.value = '' } }}><option value="">+ Label</option>{labels.map((label) => <option key={label.id} value={label.id}>{label.name}</option>)}</select></div>
}

function ContactTableRow({ contact, labels, selected, onToggle, onLabelAction }: { contact: Contact; labels: Label[]; selected: boolean; onToggle: () => void; onLabelAction: (action: 'ADD' | 'REMOVE', labelId: string) => void }) {
  return <tr><td><input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Seleccionar ${contact.display_name}`} /></td><td><strong>{contact.display_name}</strong><small>{contact.first_name}</small></td><td>{contact.phone_e164}</td><td><GenderLabel gender={contact.gender} /></td><td><ContactLabels contact={contact} labels={labels} onLabelAction={onLabelAction} /></td><td><button className="secondary" disabled title="Disponible en una fase futura">Campaña</button></td></tr>
}

function ContactCard({ contact, labels, selected, onToggle, onLabelAction }: { contact: Contact; labels: Label[]; selected: boolean; onToggle: () => void; onLabelAction: (action: 'ADD' | 'REMOVE', labelId: string) => void }) {
  return <article className="contact-card"><div className="contact-card-heading"><label><input type="checkbox" checked={selected} onChange={onToggle} /> Seleccionar</label><GenderLabel gender={contact.gender} /></div><strong>{contact.display_name}</strong><span>{contact.phone_e164}</span><ContactLabels contact={contact} labels={labels} onLabelAction={onLabelAction} /><button className="secondary" disabled>Crear campaña</button></article>
}

function GenderLabel({ gender }: { gender: string | null }) { return <span className="gender-label">{gender === 'MALE' ? 'Hombre' : gender === 'FEMALE' ? 'Mujer' : 'Desconocido'}</span> }
