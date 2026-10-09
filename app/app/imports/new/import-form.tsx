'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Mapping = { name: string; phone: string; genderSuggestion?: string; genderConfidence?: string; genderReview?: string }
type Preview = { format: 'CSV' | 'XLSX'; headers: string[]; mapping: Partial<Mapping>; preview: Record<string, string>[]; summary: { total: number; valid: number; invalid: number; duplicateInFile: number; matchedExisting: number } | null }

export function ImportForm() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [mapping, setMapping] = useState<Mapping>({ name: '', phone: '' })
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())
  async function inspect() {
    if (!file) return
    setLoading(true); setError(null); setMessage(null)
    const form = new FormData(); form.set('file', file)
    const response = await fetch('/api/import/preview', { method: 'POST', body: form })
    const data = await response.json()
    if (!response.ok) setError('No fue posible leer el archivo. Revisa el formato y las columnas.')
    else { setPreview(data); setMapping({ name: data.mapping.name ?? '', phone: data.mapping.phone ?? '', genderSuggestion: data.mapping.genderSuggestion, genderConfidence: data.mapping.genderConfidence, genderReview: data.mapping.genderReview }) }
    setLoading(false)
  }
  async function confirm() {
    if (!file || !preview || !mapping.name || !mapping.phone) return
    setLoading(true); setError(null); setMessage(null)
    const form = new FormData(); form.set('file', file); form.set('mapping', JSON.stringify(mapping)); form.set('idempotency_key', idempotencyKey)
    const response = await fetch('/api/import/confirm', { method: 'POST', body: form })
    const data = await response.json()
    if (response.status === 202) setMessage(`La respuesta de finalización fue ambigua. Conserva este flujo y reintenta la misma confirmación: ${data.importId}`)
    else if (!response.ok) setError('No fue posible completar la importación. La ejecución quedó trazable en NYX si alcanzó a iniciar.')
    else router.push(`/app/imports/${data.importId}/review`)
    setLoading(false)
  }
  return <div className="stack">
    <div className="import-stepper" aria-label="Progreso de importación"><span className="active"><b>1</b>Subir</span><i /><span><b>2</b>Revisar</span><i /><span><b>3</b>Confirmar</span><i /><span><b>4</b>Finalizado</span></div>
    <div className="panel import-upload"><label className="upload-zone" htmlFor="file"><span className="upload-icon">↑</span><strong>{file ? file.name : 'Elige un archivo CSV o XLSX'}</strong><small>{file ? `${Math.round(file.size / 1024)} KB seleccionados` : 'Arrástralo aquí o selecciónalo desde tu equipo · máximo 5 MB'}</small><input id="file" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setIdempotencyKey(crypto.randomUUID()); setPreview(null); setMessage(null); setError(null) }} /></label><button onClick={inspect} disabled={!file || loading}>{loading ? 'Leyendo archivo…' : 'Leer archivo'}</button></div>
    {error && <div className="error" role="alert">{error}</div>}
    {message && <div className="success" role="status">{message}</div>}
    {preview && <div className="panel stack"><div className="section-heading"><div><span className="eyebrow">PASO 2</span><h2>Revisa el mapeo</h2></div><span className="muted-label">Elige qué columna representa cada dato</span></div><div className="mapping-grid"><ColumnSelect id="name-column" label="Nombre" headers={preview.headers} value={mapping.name} onChange={(value) => setMapping({ ...mapping, name: value })} /><ColumnSelect id="phone-column" label="Teléfono" headers={preview.headers} value={mapping.phone} onChange={(value) => setMapping({ ...mapping, phone: value })} /><OptionalColumnSelect id="gender-suggestion-column" label="Género sugerido" headers={preview.headers} value={mapping.genderSuggestion} onChange={(value) => setMapping({ ...mapping, genderSuggestion: value || undefined })} /><OptionalColumnSelect id="gender-confidence-column" label="Confianza" headers={preview.headers} value={mapping.genderConfidence} onChange={(value) => setMapping({ ...mapping, genderConfidence: value || undefined })} /><OptionalColumnSelect id="gender-review-column" label="Revisión de género" headers={preview.headers} value={mapping.genderReview} onChange={(value) => setMapping({ ...mapping, genderReview: value || undefined })} /></div>{preview.summary ? <p>Total: {preview.summary.total} · válidas: {preview.summary.valid} · inválidas: {preview.summary.invalid} · duplicadas: {preview.summary.duplicateInFile} · existentes: {preview.summary.matchedExisting}</p> : <p>Confirma el mapeo manual para calcular el resumen.</p>}<div className="preview-table"><table><thead><tr>{preview.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{preview.preview.map((row, index) => <tr key={index}>{preview.headers.map((header) => <td key={header}>{row[header]}</td>)}</tr>)}</tbody></table></div><button onClick={confirm} disabled={loading || !mapping.name || !mapping.phone || mapping.name === mapping.phone}>{loading ? 'Guardando borrador…' : 'Guardar borrador y revisar'}</button></div>}
  </div>
}

function ColumnSelect({ id, label, headers, value, onChange }: { id: string; label: string; headers: string[]; value: string; onChange: (value: string) => void }) {
  return <div className="field"><label htmlFor={id}>{label}</label><select id={id} value={value} onChange={(event) => onChange(event.target.value)}>{headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></div>
}

function OptionalColumnSelect({ id, label, headers, value, onChange }: { id: string; label: string; headers: string[]; value?: string; onChange: (value: string) => void }) {
  return <div className="field"><label htmlFor={id}>{label} (opcional)</label><select id={id} value={value ?? ''} onChange={(event) => onChange(event.target.value)}><option value="">No usar</option>{headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></div>
}
