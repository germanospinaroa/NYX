'use client'

import { useState } from 'react'

type Preview = { format: 'CSV' | 'XLSX'; headers: string[]; mapping: { name?: string; phone?: string }; preview: Record<string, string>[]; summary: { total: number; valid: number; invalid: number; duplicateInFile: number; matchedExisting: number } | null }

export function ImportForm() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [mapping, setMapping] = useState<{ name: string; phone: string }>({ name: '', phone: '' })
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  async function inspect() {
    if (!file) return
    setLoading(true); setError(null); setMessage(null)
    const form = new FormData(); form.set('file', file)
    const response = await fetch('/api/import/preview', { method: 'POST', body: form })
    const data = await response.json()
    if (!response.ok) setError('No fue posible leer el archivo. Revisa el formato y las columnas.')
    else { setPreview(data); setMapping({ name: data.mapping.name ?? '', phone: data.mapping.phone ?? '' }) }
    setLoading(false)
  }
  async function confirm() {
    if (!file || !preview || !mapping.name || !mapping.phone) return
    setLoading(true); setError(null); setMessage(null)
    const form = new FormData(); form.set('file', file); form.set('mapping', JSON.stringify(mapping))
    const response = await fetch('/api/import/confirm', { method: 'POST', body: form })
    const data = await response.json()
    if (!response.ok) setError('No fue posible completar la importación. La ejecución quedó trazable en NYX si alcanzó a iniciar.')
    else setMessage(`Importación completada: ${data.createdContacts} contactos nuevos y ${data.matchedExistingContacts} existentes.`)
    setLoading(false)
  }
  return <div className="stack">
    <div className="card stack"><div className="field"><label htmlFor="file">Archivo CSV o XLSX (máximo 5 MB)</label><input id="file" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreview(null); setMessage(null); setError(null) }} /></div><button onClick={inspect} disabled={!file || loading}>{loading ? 'Procesando…' : 'Leer archivo'}</button></div>
    {error && <div className="error" role="alert">{error}</div>}
    {message && <div className="success" role="status">{message}</div>}
    {preview && <div className="card stack"><h2>Mapeo y resumen previo</h2><div className="row"><div className="field"><label htmlFor="name-column">Nombre</label><select id="name-column" value={mapping.name} onChange={(e) => setMapping({ ...mapping, name: e.target.value })}>{preview.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></div><div className="field"><label htmlFor="phone-column">Teléfono</label><select id="phone-column" value={mapping.phone} onChange={(e) => setMapping({ ...mapping, phone: e.target.value })}>{preview.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></div></div>{preview.summary ? <p>Total: {preview.summary.total} · válidas: {preview.summary.valid} · inválidas: {preview.summary.invalid} · duplicadas: {preview.summary.duplicateInFile} · existentes: {preview.summary.matchedExisting}</p> : <p>Confirma el mapeo manual para calcular el resumen.</p>}<div style={{ overflow: 'auto' }}><table><thead><tr>{preview.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{preview.preview.map((row, index) => <tr key={index}>{preview.headers.map((header) => <td key={header}>{row[header]}</td>)}</tr>)}</tbody></table></div><button onClick={confirm} disabled={loading || !mapping.name || !mapping.phone || mapping.name === mapping.phone}>Confirmar importación</button></div>}
  </div>
}
