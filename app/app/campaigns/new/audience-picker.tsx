'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type Label = { id: string; name: string; color?: string | null }
export type CampaignSelection =
  | { mode: 'ids'; contactIds: string[] }
  | { mode: 'filter'; q?: string; gender?: string; labelId?: string; archived?: string; excludeIds?: string[] }
type Contact = { id: string; display_name: string; phone_e164: string; gender: string | null }

const PAGE_SIZE = 50

function selectionCount(selection: CampaignSelection | null, total: number) {
  if (!selection) return 0
  return selection.mode === 'ids' ? selection.contactIds.length : Math.max(total - (selection.excludeIds?.length ?? 0), 0)
}

function isSelected(selection: CampaignSelection | null, id: string) {
  if (!selection) return false
  return selection.mode === 'ids' ? selection.contactIds.includes(id) : !(selection.excludeIds ?? []).includes(id)
}

export function AudiencePicker({ initialSelection, onConfirm, onCancel }: { initialSelection: CampaignSelection | null; onConfirm: (selection: CampaignSelection | null) => void; onCancel: () => void }) {
  const initialFilter = initialSelection?.mode === 'filter' ? initialSelection : null
  const [draft, setDraft] = useState<CampaignSelection | null>(initialSelection)
  const [query, setQuery] = useState(initialFilter?.q ?? '')
  const [gender, setGender] = useState(initialFilter?.gender ?? '')
  const [labelId, setLabelId] = useState(initialFilter?.labelId ?? '')
  const [archived, setArchived] = useState(initialFilter?.archived ?? 'ACTIVE')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [labels, setLabels] = useState<Label[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), q: query, gender, labelId, archived })
    try {
      const [contactsResponse, labelsResponse] = await Promise.all([fetch(`/api/contacts?${params}`), fetch('/api/labels')])
      const body = await contactsResponse.json().catch(() => ({})) as { contacts?: Contact[]; total?: number }
      const labelBody = await labelsResponse.json().catch(() => ({})) as { labels?: Label[] }
      if (!contactsResponse.ok) throw new Error('No fue posible cargar la audiencia.')
      setContacts(body.contacts ?? [])
      setTotal(body.total ?? 0)
      if (labelsResponse.ok) setLabels(labelBody.labels ?? [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No fue posible cargar la audiencia.')
    } finally {
      setLoading(false)
    }
  }, [archived, gender, labelId, page, query])

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { void load() }, [load])
  /* eslint-enable react-hooks/set-state-in-effect */

  const count = selectionCount(draft, total)
  const pageSelected = contacts.length > 0 && contacts.every((contact) => isSelected(draft, contact.id))
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1)

  function updateFilter(field: 'query' | 'gender' | 'labelId' | 'archived', value: string) {
    const next = { query, gender, labelId, archived, [field]: value }
    setQuery(next.query); setGender(next.gender); setLabelId(next.labelId); setArchived(next.archived); setPage(0)
    setDraft((current) => current?.mode === 'filter' ? { mode: 'filter', q: next.query, gender: next.gender, labelId: next.labelId, archived: next.archived, excludeIds: [] } : current)
  }

  function toggleContact(id: string) {
    setDraft((current) => {
      if (current?.mode === 'filter') {
        const excluded = new Set(current.excludeIds ?? [])
        if (excluded.has(id)) excluded.delete(id); else excluded.add(id)
        return { ...current, excludeIds: [...excluded] }
      }
      const ids = new Set(current?.mode === 'ids' ? current.contactIds : [])
      if (ids.has(id)) ids.delete(id); else ids.add(id)
      return ids.size ? { mode: 'ids', contactIds: [...ids] } : null
    })
  }

  function togglePage() {
    setDraft((current) => {
      if (current?.mode === 'filter') {
        const excluded = new Set(current.excludeIds ?? [])
        contacts.forEach((contact) => { if (pageSelected) excluded.add(contact.id); else excluded.delete(contact.id) })
        return { ...current, excludeIds: [...excluded] }
      }
      const ids = new Set(current?.mode === 'ids' ? current.contactIds : [])
      contacts.forEach((contact) => { if (pageSelected) ids.delete(contact.id); else ids.add(contact.id) })
      return ids.size ? { mode: 'ids', contactIds: [...ids] } : null
    })
  }

  function selectAllFiltered() {
    setDraft({ mode: 'filter', q: query, gender, labelId, archived, excludeIds: [] })
  }

  const summary = useMemo(() => count ? `${count} seleccionados` : 'Aún no has elegido destinatarios.', [count])

  return <div className="audience-picker card stack" role="dialog" aria-modal="true" aria-labelledby="audience-picker-title">
    <div className="section-heading"><div><span className="eyebrow">AUDIENCIA</span><h2 id="audience-picker-title">Seleccionar personas</h2></div><button type="button" className="icon-button" aria-label="Cerrar selector de audiencia" onClick={onCancel}>×</button></div>
    <div className="contacts-toolbar-section contacts-filter-section"><input className="contacts-search" placeholder="Buscar por nombre o teléfono" value={query} onChange={(event) => updateFilter('query', event.target.value)} /><select aria-label="Filtrar por género" value={gender} onChange={(event) => updateFilter('gender', event.target.value)}><option value="">Todos los géneros</option><option value="MALE">Hombre</option><option value="FEMALE">Mujer</option><option value="UNKNOWN">Desconocido</option></select><select aria-label="Filtrar por label" value={labelId} onChange={(event) => updateFilter('labelId', event.target.value)}><option value="">Filtrar por label</option>{labels.map((label) => <option key={label.id} value={label.id}>{label.name}</option>)}</select><select aria-label="Filtrar estado" value={archived} onChange={(event) => updateFilter('archived', event.target.value)}><option value="ACTIVE">Activos</option><option value="ARCHIVED">Archivados</option><option value="ALL">Todos</option></select></div>
    {error && <div className="inline-alert" role="alert">{error}</div>}
    <div className="contacts-toolbar-section"><button type="button" className="secondary" onClick={togglePage} disabled={loading || !contacts.length}>{pageSelected ? 'Quitar selección de página' : 'Seleccionar página'}</button>{total > contacts.length && draft?.mode !== 'filter' && <button type="button" className="secondary" onClick={selectAllFiltered} disabled={loading}>Seleccionar los {total} resultados</button>}{draft && <><strong>{summary}</strong><button type="button" className="ghost" onClick={() => setDraft(null)}>Limpiar selección</button></>}</div>
    <div className="contacts-result-heading"><strong>{total} personas coinciden</strong><span>{loading ? 'Actualizando…' : summary}</span></div>
    <div className="card table-scroll contacts-table-wrap"><table className="contacts-table"><thead><tr><th><input type="checkbox" checked={pageSelected} onChange={togglePage} aria-label="Seleccionar página" /></th><th>Nombre</th><th>Teléfono</th><th>Género</th></tr></thead><tbody>{contacts.map((contact) => <tr key={contact.id}><td><input type="checkbox" checked={isSelected(draft, contact.id)} onChange={() => toggleContact(contact.id)} aria-label={`Seleccionar ${contact.display_name}`} /></td><td>{contact.display_name}</td><td>{contact.phone_e164}</td><td>{contact.gender === 'MALE' ? 'Hombre' : contact.gender === 'FEMALE' ? 'Mujer' : 'Desconocido'}</td></tr>)}{!loading && !contacts.length && <tr><td colSpan={4}>No hay personas con estos filtros.</td></tr>}</tbody></table></div>
    <div className="contacts-mobile-list">{contacts.map((contact) => <label className="card" key={contact.id}><input type="checkbox" checked={isSelected(draft, contact.id)} onChange={() => toggleContact(contact.id)} /> <strong>{contact.display_name}</strong><small>{contact.phone_e164}</small></label>)}</div>
    <div className="row contacts-pagination" style={{ justifyContent: 'space-between' }}><span>Página {page + 1} de {totalPages}</span><div className="row"><button type="button" className="secondary" disabled={page === 0 || loading} onClick={() => setPage((value) => value - 1)}>Anterior</button><button type="button" className="secondary" disabled={page + 1 >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>Siguiente</button></div></div>
    <div className="row composer-footer"><button type="button" className="secondary" onClick={onCancel}>Cancelar</button><button type="button" onClick={() => onConfirm(draft)} disabled={!count}>Usar esta audiencia</button></div>
  </div>
}
