'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'

type ReviewRow = {
  id: string; row_number: number; raw_name: string; raw_phone: string; normalized_name: string | null; phone_e164: string | null
  result: string; error_code: string | null; gender_suggestion: string | null; gender_confidence: string | null
  gender_final: string | null; gender_review_status: string; included: boolean; row_is_ready: boolean
}
type ReviewData = { import: { id: string; status: string; total_rows: number }; summary: { total: number; ready: number; requiresReview: number; invalid: number; duplicates: number; existing: number; excluded: number }; rows: ReviewRow[]; page: number; pageSize: number }
const filters = [['ALL', 'Todos'], ['READY', 'Listos'], ['REVIEW_REQUIRED', 'Requieren género'], ['INVALID', 'Inválidos'], ['DUPLICATE', 'Duplicados'], ['EXISTING', 'Existentes'], ['EXCLUDED', 'Excluidos']] as const

export function ReviewWorkspace({ importId }: { importId: string }) {
  const [data, setData] = useState<ReviewData | null>(null)
  const [filter, setFilter] = useState('ALL')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const params = new URLSearchParams({ page: String(page), pageSize: '50', filter, q: query })
    const response = await fetch(`/api/import/${importId}/review?${params}`)
    const body = await response.json()
    if (!response.ok) setError('No fue posible cargar la revisión.')
    else setData(body)
    setLoading(false)
  }, [filter, importId, page, query])
  // The effect synchronizes the client view with the selected filter/page.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  const ids = useMemo(() => data?.rows.map((row) => row.id) ?? [], [data])
  const allPageSelected = ids.length > 0 && ids.every((id) => selected.has(id))
  function togglePage() { setSelected((current) => { const next = new Set(current); if (allPageSelected) ids.forEach((id) => next.delete(id)); else ids.forEach((id) => next.add(id)); return next }) }
  async function action(actionName: string) {
    if (!selected.size) return
    setLoading(true); setError(null); setMessage(null)
    const response = await fetch(`/api/import/${importId}/review`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rowIds: [...selected], action: actionName }) })
    if (!response.ok) setError('No fue posible guardar la acción por lote.')
    else { setMessage('Cambios guardados.'); setSelected(new Set()); await load() }
    setLoading(false)
  }
  async function finalize() {
    setLoading(true); setError(null); setMessage(null)
    const response = await fetch(`/api/import/${importId}/finalize`, { method: 'POST' })
    const body = await response.json()
    if (!response.ok) setError(body.error === 'IMPORT_REVIEW_REQUIRED' ? 'Aún hay filas incluidas que requieren revisión.' : 'No fue posible finalizar la importación.')
    else { setMessage(`Importación completada: ${body.created_contacts} contactos nuevos y ${body.matched_existing_contacts} existentes.`); await load() }
    setLoading(false)
  }
  function changeFilter(value: string) { setFilter(value); setPage(0); setSelected(new Set()) }

  return <div className="stack">
    <div className="row" style={{ justifyContent: 'space-between' }}><div><Link href="/app/imports/new">← Nueva importación</Link><h1>Revisión de importación</h1><p>{statusText(data?.import.status)} · {data?.import.total_rows ?? '…'} filas</p></div><button onClick={finalize} disabled={loading || !data || data.summary.requiresReview > 0 || data.import.status === 'COMPLETED'}>Finalizar contactos</button></div>
    {error && <div className="error" role="alert">{error}</div>}{message && <div className="success" role="status">{message}</div>}
    {data && <>
      <div className="summary-grid">{[['Total', data.summary.total], ['Listos', data.summary.ready], ['Revisión', data.summary.requiresReview], ['Inválidos', data.summary.invalid], ['Duplicados', data.summary.duplicates], ['Existentes', data.summary.existing], ['Excluidos', data.summary.excluded]].map(([label, value]) => <div className="card metric" key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
      <div className="card stack"><div className="row"><input placeholder="Buscar nombre o teléfono" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0) }} /><div className="filter-row">{filters.map(([value, label]) => <button className={filter === value ? '' : 'secondary'} key={value} onClick={() => changeFilter(value)}>{label}</button>)}</div></div><div className="row"><button className="secondary" onClick={togglePage}>{allPageSelected ? 'Quitar selección de página' : 'Seleccionar página'}</button><button onClick={() => void action('ACCEPT_SUGGESTION')} disabled={!selected.size || loading}>Aceptar sugerencias</button><button onClick={() => void action('ACCEPT_HIGH')} disabled={!selected.size || loading}>Aceptar HIGH</button><button onClick={() => void action('MARK_REVIEWED')} disabled={!selected.size || loading}>Marcar revisados</button><button className="secondary" onClick={() => void action('EXCLUDE')} disabled={!selected.size || loading}>Excluir</button><button className="secondary" onClick={() => void action('INCLUDE')} disabled={!selected.size || loading}>Incluir</button></div></div>
      <div className="card table-scroll"><table><thead><tr><th><input type="checkbox" checked={allPageSelected} onChange={togglePage} aria-label="Seleccionar página" /></th><th>Nombre original</th><th>Nombre normalizado</th><th>Teléfono original</th><th>Teléfono normalizado</th><th>Sugerido</th><th>Confianza</th><th>Final</th><th>Revisión</th><th>Validación</th><th>Incluido</th><th>Guardar</th></tr></thead><tbody>{data.rows.map((row) => <ReviewTableRow key={row.id} importId={importId} row={row} selected={selected.has(row.id)} onSelect={() => setSelected((current) => { const next = new Set(current); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next })} onSaved={load} />)}{data.rows.length === 0 && <tr><td colSpan={12}>No hay filas para este filtro.</td></tr>}</tbody></table></div>
      <div className="row" style={{ justifyContent: 'space-between' }}><button className="secondary" disabled={page === 0 || loading} onClick={() => setPage((value) => value - 1)}>Anterior</button><span>Página {page + 1} · mostrando hasta 50 filas</span><button className="secondary" disabled={data.rows.length < 50 || loading} onClick={() => setPage((value) => value + 1)}>Siguiente</button></div>
    </>}
  </div>
}

function ReviewTableRow({ importId, row, selected, onSelect, onSaved }: { importId: string; row: ReviewRow; selected: boolean; onSelect: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(row.normalized_name ?? row.raw_name)
  const [phone, setPhone] = useState(row.phone_e164 ?? row.raw_phone)
  const [gender, setGender] = useState(row.gender_final ?? '')
  const [included, setIncluded] = useState(row.included)
  const [saving, setSaving] = useState(false)
  async function save() {
    setSaving(true)
    const response = await fetch(`/api/import/${importId}/review/row?rowId=${row.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, phone, genderFinal: gender || null, included }) })
    if (response.ok) await onSaved()
    setSaving(false)
  }
  return <tr><td><input type="checkbox" checked={selected} onChange={onSelect} aria-label={`Seleccionar fila ${row.row_number}`} /></td><td>{row.raw_name}</td><td><input value={name} onChange={(event) => setName(event.target.value)} /></td><td>{row.raw_phone}</td><td><input value={phone} onChange={(event) => setPhone(event.target.value)} /></td><td>{row.gender_suggestion ?? '—'}</td><td>{row.gender_confidence ?? '—'}</td><td><select value={gender} onChange={(event) => setGender(event.target.value)}><option value="">Pendiente</option><option value="MALE">MALE</option><option value="FEMALE">FEMALE</option><option value="UNKNOWN">UNKNOWN</option></select></td><td>{row.gender_review_status}</td><td>{row.result}{row.error_code ? ` (${row.error_code})` : ''}</td><td><input type="checkbox" checked={included} onChange={(event) => setIncluded(event.target.checked)} aria-label="Incluir fila" /></td><td><button onClick={save} disabled={saving}>{saving ? '…' : 'Guardar'}</button></td></tr>
}

function statusText(status?: string) { return ({ STAGING: 'Guardando borrador', REVIEW_REQUIRED: 'Revisión pendiente', READY_TO_FINALIZE: 'Listo para finalizar', FINALIZING: 'Finalizando contactos', COMPLETED: 'Completado', FAILED: 'Error' } as Record<string, string>)[status ?? ''] ?? 'Analizando archivo' }
