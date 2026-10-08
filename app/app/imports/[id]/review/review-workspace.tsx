'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { applyDraft, createDraft, dirtyDraftEntries, removeDrafts, type ReviewDraft } from '@/lib/imports/review-drafts'

type ReviewRow = {
  id: string; row_number: number; raw_name: string; raw_phone: string; normalized_name: string | null; phone_e164: string | null
  result: string; error_code: string | null; gender_suggestion: string | null; gender_confidence: string | null
  gender_final: string | null; gender_review_status: string; included: boolean; row_is_ready: boolean
}
type ReviewData = { import: { id: string; status: string; total_rows: number }; summary: { total: number; ready: number; requiresReview: number; invalid: number; duplicates: number; existing: number; excluded: number }; rows: ReviewRow[]; page: number; pageSize: number }
const filters = [['ALL', 'Todos'], ['READY', 'Listos'], ['REVIEW_REQUIRED', 'Requieren género'], ['INVALID', 'Inválidos'], ['DUPLICATE', 'Duplicados'], ['EXISTING', 'Existentes'], ['EXCLUDED', 'Excluidos']] as const
const actions = ['ACCEPT_SUGGESTION', 'ACCEPT_HIGH', 'MARK_REVIEWED', 'EXCLUDE', 'INCLUDE'] as const
type ReviewAction = typeof actions[number]

export function ReviewWorkspace({ importId }: { importId: string }) {
  const [data, setData] = useState<ReviewData | null>(null)
  const [filter, setFilter] = useState('REVIEW_REQUIRED')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [dirty, setDirty] = useState<Record<string, ReviewDraft>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const firstLoad = useRef(true)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const params = new URLSearchParams({ page: String(page), pageSize: '50', filter, q: query })
    const response = await fetch(`/api/import/${importId}/review?${params}`)
    const body = await response.json()
    if (!response.ok) setError('No fue posible cargar la revisión.')
    else {
      setData(body)
      if (firstLoad.current && filter === 'REVIEW_REQUIRED') {
        firstLoad.current = false
        if (body.summary.requiresReview === 0) setFilter(body.summary.ready > 0 ? 'READY' : 'ALL')
      }
    }
    setLoading(false)
  }, [filter, importId, page, query])

  // Dirty drafts live above the paginated table and survive filter/page changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  const ids = useMemo(() => data?.rows.map((row) => row.id) ?? [], [data])
  const allPageSelected = ids.length > 0 && ids.every((id) => selected.has(id))
  const dirtyRows = dirtyDraftEntries(dirty)

  function updateDraft(row: ReviewRow, patch: Partial<Omit<ReviewDraft, 'id'>>) {
    setDirty((current) => applyDraft(current, { ...(current[row.id] ?? createDraft(row)), ...patch }))
  }
  function togglePage() {
    setSelected((current) => { const next = new Set(current); if (allPageSelected) ids.forEach((id) => next.delete(id)); else ids.forEach((id) => next.add(id)); return next })
  }
  async function saveChanges() {
    if (!dirtyRows.length) return
    setLoading(true); setError(null); setMessage(null)
    const idsToRemove = dirtyRows.map((draft) => draft.id)
    const response = await fetch(`/api/import/${importId}/review`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ changes: dirtyRows }) })
    if (!response.ok) setError('No fue posible guardar los cambios.')
    else { setDirty((current) => removeDrafts(current, idsToRemove)); setMessage(`Cambios guardados (${idsToRemove.length}).`); await load() }
    setLoading(false)
  }
  async function action(actionName: ReviewAction) {
    if (!selected.size || dirtyRows.length) return
    setLoading(true); setError(null); setMessage(null)
    const response = await fetch(`/api/import/${importId}/review`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rowIds: [...selected], action: actionName }) })
    if (!response.ok) setError('No fue posible guardar la acción por lote.')
    else { setMessage('Cambios guardados.'); setSelected(new Set()); await load() }
    setLoading(false)
  }
  async function finalize() {
    if (dirtyRows.length) return
    setLoading(true); setError(null); setMessage(null)
    const response = await fetch(`/api/import/${importId}/finalize`, { method: 'POST' }); const body = await response.json()
    if (!response.ok) setError(body.error === 'IMPORT_REVIEW_REQUIRED' ? 'Aún hay filas incluidas que requieren revisión.' : 'No fue posible finalizar la importación.')
    else { setMessage(`Importación completada: ${body.created_contacts} contactos nuevos y ${body.matched_existing_contacts} existentes.`); await load() }
    setLoading(false)
  }
  function changeFilter(value: string) { setFilter(value); setPage(0); setSelected(new Set()) }
  function discardChanges() { setDirty({}); setMessage('Cambios descartados.') }

  return <div className="review-workspace stack">
    <div className="row" style={{ justifyContent: 'space-between' }}><div><Link href="/app/imports/new">← Nueva importación</Link><h1>Revisión de importación</h1><p>{statusText(data?.import.status)} · {data?.import.total_rows ?? '…'} filas</p></div><button onClick={() => void finalize()} disabled={loading || !data || dirtyRows.length > 0 || data.summary.requiresReview > 0 || data.import.status === 'COMPLETED'}>Finalizar contactos</button></div>
    {dirtyRows.length > 0 && <div className="review-save-bar" role="status"><strong>{dirtyRows.length} cambios sin guardar</strong><span>Los cambios se conservan al cambiar filtros o páginas.</span><button onClick={() => void saveChanges()} disabled={loading}>Guardar cambios ({dirtyRows.length})</button><button className="secondary" onClick={discardChanges} disabled={loading}>Descartar</button></div>}
    {error && <div className="error" role="alert">{error}</div>}{message && <div className="success" role="status">{message}</div>}
    {data && <>
      <div className="summary-grid">{[['Total', data.summary.total], ['Listos', data.summary.ready], ['Revisión', data.summary.requiresReview], ['Inválidos', data.summary.invalid], ['Duplicados', data.summary.duplicates], ['Existentes', data.summary.existing], ['Excluidos', data.summary.excluded]].map(([label, value]) => <div className="card metric" key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
      <div className="card stack"><div className="row"><input placeholder="Buscar nombre o teléfono" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0) }} /><div className="filter-row">{filters.map(([value, label]) => <button className={filter === value ? '' : 'secondary'} key={value} onClick={() => changeFilter(value)}>{label}</button>)}</div></div><div className="row"><button className="secondary" onClick={togglePage}>{allPageSelected ? 'Quitar selección de página' : 'Seleccionar página'}</button>{actions.slice(0, 3).map((actionName) => <button key={actionName} onClick={() => void action(actionName)} disabled={!selected.size || loading || dirtyRows.length > 0}>{actionLabel(actionName)}</button>)}{actions.slice(3).map((actionName) => <button className="secondary" key={actionName} onClick={() => void action(actionName)} disabled={!selected.size || loading || dirtyRows.length > 0}>{actionLabel(actionName)}</button>)}</div></div>
      <div className="card table-scroll review-table-wrap"><table className="review-table"><colgroup><col className="col-check" /><col className="col-original-name" /><col className="col-name" /><col className="col-original-phone" /><col className="col-phone" /><col className="col-suggested" /><col className="col-confidence" /><col className="col-final" /><col className="col-state" /><col className="col-action" /></colgroup><thead><tr><th className="sticky-col sticky-check"><input type="checkbox" checked={allPageSelected} onChange={togglePage} aria-label="Seleccionar página" /></th><th className="sticky-col sticky-name">Nombre original</th><th>Nombre</th><th className="sticky-col sticky-phone">Teléfono original</th><th>Teléfono</th><th>Sugerido</th><th>Confianza</th><th>Final</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{data.rows.map((row) => <ReviewTableRow key={row.id} row={row} draft={dirty[row.id]} selected={selected.has(row.id)} onSelect={() => setSelected((current) => { const next = new Set(current); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next })} onChange={(patch) => updateDraft(row, patch)} />)}{data.rows.length === 0 && <tr><td colSpan={10}>No hay filas para este filtro.</td></tr>}</tbody></table></div>
      <div className="review-mobile-list">{data.rows.map((row) => <ReviewMobileCard key={row.id} row={row} draft={dirty[row.id]} selected={selected.has(row.id)} onSelect={() => setSelected((current) => { const next = new Set(current); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next })} onChange={(patch) => updateDraft(row, patch)} />)}{data.rows.length === 0 && <div className="card">No hay filas para este filtro.</div>}</div>
      <div className="row" style={{ justifyContent: 'space-between' }}><button className="secondary" disabled={page === 0 || loading} onClick={() => setPage((value) => value - 1)}>Anterior</button><span>Página {page + 1} · mostrando hasta 50 filas</span><button className="secondary" disabled={data.rows.length < 50 || loading} onClick={() => setPage((value) => value + 1)}>Siguiente</button></div>
    </>}
  </div>
}

function ReviewTableRow({ row, draft, selected, onSelect, onChange }: { row: ReviewRow; draft?: ReviewDraft; selected: boolean; onSelect: () => void; onChange: (patch: Partial<Omit<ReviewDraft, 'id'>>) => void }) {
  const current = draft ?? createDraft(row)
  return <tr className={draft ? 'row-dirty' : undefined}><td className="sticky-col sticky-check"><input type="checkbox" checked={selected} onChange={onSelect} aria-label={`Seleccionar fila ${row.row_number}`} /></td><td className="sticky-col sticky-name">{row.raw_name}</td><td><input value={current.name} onChange={(event) => onChange({ name: event.target.value })} aria-label={`Nombre fila ${row.row_number}`} /></td><td className="sticky-col sticky-phone">{row.raw_phone}</td><td><input value={current.phone} onChange={(event) => onChange({ phone: event.target.value })} aria-label={`Teléfono fila ${row.row_number}`} /></td><td>{row.gender_suggestion ?? '—'}</td><td>{row.gender_confidence ?? '—'}</td><td><select value={current.genderFinal ?? ''} onChange={(event) => onChange({ genderFinal: event.target.value ? event.target.value as ReviewDraft['genderFinal'] : null })}><option value="">Pendiente</option><option value="MALE">MALE</option><option value="FEMALE">FEMALE</option><option value="UNKNOWN">UNKNOWN</option></select></td><td><RowState row={row} dirty={Boolean(draft)} /></td><td><RowAction included={current.included} onToggle={() => onChange({ included: !current.included })} /></td></tr>
}

function ReviewMobileCard({ row, draft, selected, onSelect, onChange }: { row: ReviewRow; draft?: ReviewDraft; selected: boolean; onSelect: () => void; onChange: (patch: Partial<Omit<ReviewDraft, 'id'>>) => void }) {
  const current = draft ?? createDraft(row)
  return <article className={`review-mobile-card${draft ? ' row-dirty' : ''}`}><div className="review-card-heading"><label><input type="checkbox" checked={selected} onChange={onSelect} /> Seleccionar</label><RowState row={row} dirty={Boolean(draft)} /></div><div className="review-card-grid"><label>Nombre original<span>{row.raw_name}</span></label><label>Nombre<input value={current.name} onChange={(event) => onChange({ name: event.target.value })} /></label><label>Teléfono original<span>{row.raw_phone}</span></label><label>Teléfono<input value={current.phone} onChange={(event) => onChange({ phone: event.target.value })} /></label><label>Sugerido<span>{row.gender_suggestion ?? '—'} · {row.gender_confidence ?? '—'}</span></label><label>Final<select value={current.genderFinal ?? ''} onChange={(event) => onChange({ genderFinal: event.target.value ? event.target.value as ReviewDraft['genderFinal'] : null })}><option value="">Pendiente</option><option value="MALE">MALE</option><option value="FEMALE">FEMALE</option><option value="UNKNOWN">UNKNOWN</option></select></label></div><RowAction included={current.included} onToggle={() => onChange({ included: !current.included })} /></article>
}

function RowState({ row, dirty }: { row: ReviewRow; dirty: boolean }) {
  const state = dirty ? 'Modificado' : row.result.startsWith('INVALID') ? 'Inválido' : row.result === 'DUPLICATE_IN_FILE' ? 'Duplicado' : row.result === 'MATCHED_EXISTING' ? 'Existente' : !row.included ? 'Excluido' : row.row_is_ready ? 'Listo' : 'Pendiente'
  return <span className={`row-state state-${state.toLocaleLowerCase()}`}>{state}{row.error_code ? ` (${row.error_code})` : ''}</span>
}

function RowAction({ included, onToggle }: { included: boolean; onToggle: () => void }) {
  return <button className={included ? 'secondary row-action' : 'row-action'} onClick={onToggle}>{included ? 'Descartar' : 'Restaurar'}</button>
}

function actionLabel(action: ReviewAction) { return ({ ACCEPT_SUGGESTION: 'Aceptar sugerencias', ACCEPT_HIGH: 'Aceptar HIGH', MARK_REVIEWED: 'Marcar revisados', EXCLUDE: 'Descartar seleccionados', INCLUDE: 'Restaurar seleccionados' })[action] }
function statusText(status?: string) { return ({ STAGING: 'Guardando borrador', REVIEW_REQUIRED: 'Revisión pendiente', READY_TO_FINALIZE: 'Listo para finalizar', FINALIZING: 'Finalizando contactos', COMPLETED: 'Completado', FAILED: 'Error' } as Record<string, string>)[status ?? ''] ?? 'Analizando archivo' }
