'use client'

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConversationPreview } from '@/app/app/messages/conversation-preview'
import { AudiencePicker, type CampaignSelection } from './audience-picker'
import { resolveCampaignStep, resolveCampaignVariant } from '@/lib/campaigns/personalization'
import { insertTemplateVariable, type CampaignVariableToken } from '@/lib/campaigns/variables'
import { validateAudioFile, validateImageFile } from '@/lib/messages/upload'
import { useAudioRecorder } from '@/lib/messages/use-audio-recorder'
import { CONTENT_VARIANT_KEYS, validateContentVariants, type ContentVariantKey } from '@/lib/campaigns/variants'

type StepType = 'TEXT' | 'IMAGE' | 'AUDIO'
type Step = { id: string; type: StepType; neutralText: string; maleText: string; femaleText: string; neutralCaption: string; maleCaption: string; femaleCaption: string; mediaPath?: string; mimeType?: string; durationMs?: number; previewUrl?: string; uploading?: boolean; recording?: boolean }
type ContentVariant = { key: ContentVariantKey; steps: Step[] }
type Preflight = { selected: number; eligible: number; samples?: Array<{ first_name: string | null; display_name: string; gender: string | null }> }

const base = (): Step => ({ id: crypto.randomUUID(), type: 'TEXT', neutralText: '', maleText: '', femaleText: '', neutralCaption: '', maleCaption: '', femaleCaption: '' })
const makeStep = (type: StepType): Step => ({ ...base(), type })
const makeVariant = (key: ContentVariantKey, steps: Step[] = [base()]): ContentVariant => ({ key, steps })
const cloneVariant = (variant: ContentVariant, key: ContentVariantKey): ContentVariant => ({ key, steps: variant.steps.map((step) => ({ ...step, id: crypto.randomUUID(), recording: false, uploading: false })) })

function clean(step: Step) {
  if (step.type === 'AUDIO') return { type: step.type, mediaPath: step.mediaPath, mimeType: step.mimeType, durationMs: step.durationMs }
  if (step.type === 'IMAGE') return { type: step.type, mediaPath: step.mediaPath, neutralCaption: step.neutralCaption || undefined, maleCaption: step.maleCaption || undefined, femaleCaption: step.femaleCaption || undefined }
  return { type: step.type, neutralText: step.neutralText, maleText: step.maleText || undefined, femaleText: step.femaleText || undefined }
}

export function CampaignForm() {
  const router = useRouter()
  const [selection, setSelection] = useState<CampaignSelection | null>(null)
  const [name, setName] = useState('')
  const [variants, setVariants] = useState<ContentVariant[]>([makeVariant('A')])
  const [activeVariantKey, setActiveVariantKey] = useState<ContentVariantKey>('A')
  const [preflight, setPreflight] = useState<Preflight | null>(null)
  const [preflightLoading, setPreflightLoading] = useState(false)
  const [audiencePickerOpen, setAudiencePickerOpen] = useState(false)
  const [sampleIndex, setSampleIndex] = useState(0)
  const [previewVariantKey, setPreviewVariantKey] = useState<ContentVariantKey>('A')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const textareas = useRef<Record<string, HTMLTextAreaElement | null>>({})
  const registerTextarea = (key: string, node: HTMLTextAreaElement | null) => { textareas.current[key] = node }

  // Selection is restored from Contacts after mount.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const raw = window.sessionStorage.getItem('nyx-campaign-selection')
    if (raw) try { setSelection(JSON.parse(raw) as CampaignSelection) } catch { setError('No fue posible recuperar la audiencia seleccionada.') }
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!selection) { setPreflight(null); setPreflightLoading(false); return }
    let active = true
    setPreflight(null)
    setPreflightLoading(true)
    void fetch('/api/campaigns/preflight', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ selection }) }).then(async (response) => {
      if (!active) return
      if (response.ok) setPreflight(await response.json() as Preflight)
      else setError('No fue posible calcular la audiencia.')
    }).catch(() => { if (active) setError('No fue posible calcular la audiencia.') }).finally(() => { if (active) setPreflightLoading(false) })
    return () => { active = false }
  }, [selection])
  /* eslint-enable react-hooks/set-state-in-effect */

  const activeVariant = variants.find((variant) => variant.key === activeVariantKey) ?? variants[0]
  const previewVariant = variants.find((variant) => variant.key === previewVariantKey) ?? activeVariant
  const steps = activeVariant?.steps ?? []
  const audience = preflight ? `${preflight.selected} seleccionados` : selection?.mode === 'ids' ? `${selection.contactIds.length} seleccionados` : selection ? 'calculando…' : 'Aún no has elegido destinatarios.'
  const sample = preflight?.samples?.[sampleIndex] ?? null
  const sampleVariant = sample ? resolveCampaignVariant(sample.gender, previewVariant.steps) : 'NEUTRAL'
  const update = (id: string, patch: Partial<Step>) => setVariants((current) => current.map((variant) => ({ ...variant, steps: variant.steps.map((step) => step.id === id ? { ...step, ...patch } : step) })))
  const move = (id: string, direction: -1 | 1) => setVariants((current) => current.map((variant) => {
    if (variant.key !== activeVariantKey) return variant
    const index = variant.steps.findIndex((step) => step.id === id); const target = index + direction
    if (target < 0 || target >= variant.steps.length) return variant
    const next = [...variant.steps]; [next[index], next[target]] = [next[target], next[index]]
    return { ...variant, steps: next }
  }))
  const insertVariable = (stepId: string, field: keyof Step, variable: CampaignVariableToken) => {
    const key = `${stepId}:${field}`
    const input = textareas.current[key]
    const currentValue = String(input?.value ?? '')
    const result = insertTemplateVariable(currentValue, input?.selectionStart ?? currentValue.length, input?.selectionEnd ?? currentValue.length, variable)
    update(stepId, { [field]: result.value })
    requestAnimationFrame(() => { const next = textareas.current[key]; next?.focus(); next?.setSelectionRange(result.cursor, result.cursor) })
  }
  async function upload(id: string, file: File, type: StepType) {
    if (type === 'TEXT') return
    const message = type === 'IMAGE' ? validateImageFile(file) : validateAudioFile(file)
    if (message) { setError(message); return }
    const previewUrl = URL.createObjectURL(file)
    update(id, { uploading: true, previewUrl, mimeType: file.type })
    const body = new FormData(); body.set('file', file); body.set('kind', type)
    try {
      const response = await fetch('/api/media/upload', { method: 'POST', body })
      const result = await response.json().catch(() => ({})) as { path?: string; durationMs?: number }
      if (!response.ok || !result.path) throw new Error()
      update(id, { mediaPath: result.path, uploading: false, durationMs: result.durationMs })
    } catch { update(id, { uploading: false }); setError(`No fue posible subir ${type === 'IMAGE' ? 'la imagen' : 'el audio'}.`) }
  }
  const audioRecorder = useAudioRecorder((id, file) => { update(id, { recording: false }); void upload(id, file, 'AUDIO') })
  const recordingActive = Boolean(audioRecorder.activeStepId)
  async function recordAudio(id: string) {
    try { await audioRecorder.start(id); update(id, { recording: true }) }
    catch (recordError) {
      const code = recordError instanceof Error ? recordError.message : ''
      setError(code === 'UNSUPPORTED_AUDIO' ? 'Tu navegador no permite grabar audio aquí. Puedes subir un audio.' : code === 'RECORDING_IN_PROGRESS' ? 'Ya hay otra grabación en curso. Deténla antes de grabar este paso.' : 'No pudimos acceder al micrófono. Revisa el permiso o sube un audio.')
    }
  }
  function remove(id: string) {
    if (audioRecorder.activeStepId === id) audioRecorder.cancel()
    setVariants((current) => current.map((variant) => variant.key === activeVariantKey && variant.steps.length > 1 ? { ...variant, steps: variant.steps.filter((step) => step.id !== id) } : variant))
  }
  function changeType(step: Step, type: StepType) {
    if (audioRecorder.activeStepId === step.id) audioRecorder.cancel()
    update(step.id, { ...makeStep(type), id: step.id })
  }
  function addVariant() {
    const nextKey = CONTENT_VARIANT_KEYS.find((key) => !variants.some((variant) => variant.key === key))
    if (!nextKey || !activeVariant) return
    const next = cloneVariant(activeVariant, nextKey)
    setVariants((current) => [...current, next]); setActiveVariantKey(nextKey); setPreviewVariantKey(nextKey)
  }
  function removeVariant(key: ContentVariantKey) {
    if (key === 'A') return
    if (audioRecorder.activeStepId && variants.find((variant) => variant.key === key)?.steps.some((step) => step.id === audioRecorder.activeStepId)) audioRecorder.cancel()
    setVariants((current) => current.filter((variant) => variant.key !== key))
    if (activeVariantKey === key) setActiveVariantKey('A')
    if (previewVariantKey === key) setPreviewVariantKey('A')
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(null)
    if (audiencePickerOpen) return
    if (!selection) { setError('Selecciona una audiencia antes de preparar la campaña.'); return }
    if (!preflight || preflightLoading) { setError('Espera a que termine el cálculo de la audiencia.'); return }
    if (preflight.eligible < 1) { setError('No hay personas elegibles en esta audiencia.'); return }
    try { validateContentVariants(variants.map((variant) => ({ key: variant.key, steps: variant.steps }))) } catch (validationError) {
      const code = validationError instanceof Error ? validationError.message : ''
      setError(code === 'VARIANT_STEP_COUNT_MISMATCH' ? 'Todas las versiones deben tener el mismo número de pasos.' : code === 'VARIANT_STEP_TYPE_MISMATCH' ? 'Todas las versiones deben usar el mismo tipo en cada paso.' : 'Revisa las versiones de la campaña.')
      return
    }
    const invalidVariant = variants.find((variant) => variant.steps.some((step) => (step.type === 'TEXT' && !step.neutralText.trim()) || (step.type !== 'TEXT' && !step.mediaPath) || step.uploading || step.recording))
    if (invalidVariant) { setError(`Versión ${invalidVariant.key} · completa todos los pasos antes de preparar la campaña.`); return }
    setSaving(true)
    try {
      const response = await fetch('/api/campaigns', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, variants: variants.map((variant) => ({ key: variant.key, steps: variant.steps.map(clean) })), selection }) })
      const result = await response.json().catch(() => ({})) as { error?: string; campaign?: { campaign_id?: string } }
      if (!response.ok || !result.campaign?.campaign_id) throw new Error(result.error ?? 'CAMPAIGN_CREATE_FAILED')
      window.sessionStorage.removeItem('nyx-campaign-selection')
      router.push(`/app/campaigns/${result.campaign.campaign_id}`)
    } catch (submitError) {
      const code = submitError instanceof Error ? submitError.message : ''
      setError(code === 'VARIABLE_NO_COMPATIBLE' ? 'Esta variable todavía no está disponible.' : code === 'MISSING_RECIPIENT_NAME' ? 'Falta el nombre de una persona elegible.' : code === 'NO_ELIGIBLE_RECIPIENTS' ? 'No hay personas elegibles en esta audiencia.' : code === 'VARIANT_STEP_COUNT_MISMATCH' ? 'Todas las versiones deben tener el mismo número de pasos.' : code === 'VARIANT_STEP_TYPE_MISMATCH' ? 'Todas las versiones deben usar el mismo tipo en cada paso.' : code === 'INVALID_AUDIO_MIME' ? 'Una versión contiene un formato de audio no compatible.' : 'No fue posible preparar la campaña.')
      setSaving(false)
    }
  }
  const previewSteps = previewVariant.steps.map((step) => {
    const resolved = sample ? resolveCampaignStep(step, sampleVariant, { firstNameSnapshot: sample.first_name, displayNameSnapshot: sample.display_name }) : { text: step.neutralText, caption: step.neutralCaption }
    return { id: step.id, type: step.type, text: resolved.text, caption: resolved.caption, mediaPath: step.mediaPath, previewUrl: step.previewUrl, mimeType: step.mimeType, durationMs: step.durationMs }
  })

  const chooseAudience = (next: CampaignSelection | null) => { setSelection(next); setAudiencePickerOpen(false); setSampleIndex(0); setError(null) }
  const openAudiencePicker = () => { setError(null); setAudiencePickerOpen(true) }

  return <form className="campaign-sequence-form" onSubmit={(event) => void submit(event)}>
    {error && <div className="inline-alert" role="alert">{error}</div>}
    {audiencePickerOpen ? <AudiencePicker initialSelection={selection} onConfirm={chooseAudience} onCancel={() => setAudiencePickerOpen(false)} /> : <div className="campaign-composer-layout"><div className="card stack">
      <div className="section-heading"><div><span className="eyebrow">AUDIENCIA</span><h1>Nueva campaña</h1></div><button type="button" className="secondary" onClick={openAudiencePicker}>{selection ? 'Editar audiencia' : 'Seleccionar personas'}</button></div>
      <section className="audience-summary panel"><strong>Audiencia</strong>{selection ? <><span>{audience}</span>{preflightLoading && <span className="muted">Calculando elegibilidad…</span>}{preflight && <div className="campaign-preflight"><span>{preflight.eligible} elegibles</span></div>} {preflight?.eligible === 0 && <div className="inline-alert" role="status">No hay personas elegibles en esta audiencia.</div>}<button type="button" className="ghost" onClick={() => setSelection(null)}>Limpiar audiencia</button></> : <><span>Aún no has elegido destinatarios.</span><button type="button" onClick={openAudiencePicker}>Seleccionar personas</button></>}</section>
      <label>Nombre de campaña (opcional)<input value={name} onChange={(event) => setName(event.target.value)} /></label>
      <section className="campaign-variants panel"><div className="sequence-heading"><div><h2>Variantes del mensaje</h2><span className="muted">Cada persona recibirá una sola versión.</span></div><button type="button" className="secondary" onClick={addVariant} disabled={variants.length >= 5 || recordingActive}>+ Añadir variante</button></div>{recordingActive && <span className="muted" role="status">Detén la grabación antes de cambiar de versión.</span>}<div className="row" role="tablist" aria-label="Versiones de la campaña">{variants.map((variant) => <span className="row" key={variant.key}><button type="button" role="tab" aria-selected={activeVariantKey === variant.key} className={activeVariantKey === variant.key ? '' : 'secondary'} onClick={() => setActiveVariantKey(variant.key)} disabled={recordingActive}>Versión {variant.key}</button>{variant.key !== 'A' && <button type="button" className="icon-button" aria-label={`Eliminar versión ${variant.key}`} onClick={() => removeVariant(variant.key)} disabled={recordingActive}>×</button>}</span>)}</div>{preflight && <div className="campaign-preflight"><strong>Distribución al preparar</strong>{variants.map((variant, index) => <span key={variant.key}>{variant.key} · {Math.floor(preflight.eligible / variants.length) + (index < preflight.eligible % variants.length ? 1 : 0)}</span>)}</div>}</section>
      {preflight && <div className="campaign-preflight"><strong>Antes de preparar</strong><span>Seleccionados: {preflight.selected}</span><strong>Elegibles: {preflight.eligible}</strong></div>}
      <div className="sequence-heading"><h2>Secuencia de mensajes</h2><span>{steps.length} pasos</span></div>
      {steps.map((step, index) => <article className="sequence-step" key={step.id}><div className="sequence-step-heading"><strong>Paso {index + 1} · {step.type === 'TEXT' ? 'Texto' : step.type === 'IMAGE' ? 'Imagen' : 'Audio'}</strong><div className="row"><button type="button" className="icon-button" aria-label="Mover arriba" onClick={() => move(step.id, -1)} disabled={index === 0}>↑</button><button type="button" className="icon-button" aria-label="Mover abajo" onClick={() => move(step.id, 1)} disabled={index === steps.length - 1}>↓</button><button type="button" className="icon-button" aria-label="Eliminar paso" onClick={() => remove(step.id)} disabled={steps.length === 1}>×</button></div></div>
        <label>Tipo<select value={step.type} onChange={(event) => changeType(step, event.target.value as StepType)}><option value="TEXT">Texto</option><option value="IMAGE">Imagen</option><option value="AUDIO">Audio</option></select></label>
        {step.type === 'TEXT' ? <><VariableTextarea label="Mensaje neutral" value={step.neutralText} onChange={(value) => update(step.id, { neutralText: value })} textareaKey={`${step.id}:neutralText`} registerRef={registerTextarea} onInsert={(variable) => insertVariable(step.id, 'neutralText', variable)} /><VariableTextarea label="Variante hombre" value={step.maleText} onChange={(value) => update(step.id, { maleText: value })} textareaKey={`${step.id}:maleText`} registerRef={registerTextarea} onInsert={(variable) => insertVariable(step.id, 'maleText', variable)} /><VariableTextarea label="Variante mujer" value={step.femaleText} onChange={(value) => update(step.id, { femaleText: value })} textareaKey={`${step.id}:femaleText`} registerRef={registerTextarea} onInsert={(variable) => insertVariable(step.id, 'femaleText', variable)} /></> : <><label className="upload-dropzone"><strong>{step.type === 'IMAGE' ? 'Subir imagen' : 'Subir audio'}</strong><small>{step.type === 'IMAGE' ? 'JPG, PNG o WebP · hasta 8 MB' : 'WebM, OGG, MP4 o MP3 · hasta 16 MB'}</small><input type="file" accept={step.type === 'IMAGE' ? 'image/jpeg,image/png,image/webp' : 'audio/webm,audio/ogg,audio/mp4,audio/mpeg'} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(step.id, file, step.type) }} /></label>{step.type === 'AUDIO' && <button type="button" className="secondary" onClick={() => step.recording ? audioRecorder.stop() : void recordAudio(step.id)}>{step.recording ? 'Detener' : 'Grabar audio'}</button>}{step.recording && <span role="status" aria-live="polite">Grabando…</span>}{step.previewUrl && (step.type === 'IMAGE' ? <img className="sequence-image-preview" src={step.previewUrl} alt="Vista previa" /> : <audio controls src={step.previewUrl} aria-label="Vista previa del audio" />)}{step.type === 'IMAGE' && <details><summary>Variantes de caption</summary><VariableTextarea label="Caption neutral" value={step.neutralCaption} onChange={(value) => update(step.id, { neutralCaption: value })} textareaKey={`${step.id}:neutralCaption`} registerRef={registerTextarea} onInsert={(variable) => insertVariable(step.id, 'neutralCaption', variable)} /><VariableTextarea label="Caption hombre" value={step.maleCaption} onChange={(value) => update(step.id, { maleCaption: value })} textareaKey={`${step.id}:maleCaption`} registerRef={registerTextarea} onInsert={(variable) => insertVariable(step.id, 'maleCaption', variable)} /><VariableTextarea label="Caption mujer" value={step.femaleCaption} onChange={(value) => update(step.id, { femaleCaption: value })} textareaKey={`${step.id}:femaleCaption`} registerRef={registerTextarea} onInsert={(variable) => insertVariable(step.id, 'femaleCaption', variable)} /></details>}<span>{step.uploading ? 'Subiendo…' : step.mediaPath ? 'Archivo listo' : 'Selecciona un archivo'}</span></>}
      </article>)}
      <div className="row"><button type="button" className="secondary" onClick={() => setVariants((current) => current.map((variant) => variant.key === activeVariantKey ? { ...variant, steps: [...variant.steps, makeStep('TEXT')] } : variant))}>+ Texto</button><button type="button" className="secondary" onClick={() => setVariants((current) => current.map((variant) => variant.key === activeVariantKey ? { ...variant, steps: [...variant.steps, makeStep('IMAGE')] } : variant))}>+ Imagen</button><button type="button" className="secondary" onClick={() => setVariants((current) => current.map((variant) => variant.key === activeVariantKey ? { ...variant, steps: [...variant.steps, makeStep('AUDIO')] } : variant))}>+ Audio</button></div>
    </div><aside className="composer-preview"><div className="row"><strong>Vista como</strong>{preflight?.samples?.length ? <select value={sampleIndex} onChange={(event) => setSampleIndex(Number(event.target.value))}>{preflight.samples.map((person, index) => <option key={person.display_name + index} value={index}>{person.display_name}</option>)}</select> : <span>muestra elegible</span>}</div><label>Versión<select value={previewVariantKey} onChange={(event) => setPreviewVariantKey(event.target.value as ContentVariantKey)}>{variants.map((variant) => <option key={variant.key} value={variant.key}>Versión {variant.key}</option>)}</select></label><small className="muted">Adaptación: {sampleVariant === 'NEUTRAL' ? 'general' : sampleVariant === 'MALE' ? 'hombre' : 'mujer'}</small><ConversationPreview steps={previewSteps} recipient={{ name: sample?.display_name ?? audience }} /></aside></div>}
    {!audiencePickerOpen && <div className="row composer-footer"><button type="button" className="secondary" onClick={() => router.back()}>Cancelar</button><button disabled={saving || Boolean(audioRecorder.activeStepId) || variants.some((variant) => variant.steps.some((step) => step.uploading || step.recording)) || !selection || preflightLoading || !preflight || preflight.eligible < 1}>{saving ? 'Preparando…' : 'Preparar campaña'}</button></div>}
  </form>
}

function VariableTextarea({ label, value, onChange, textareaKey, registerRef, onInsert }: { label: string; value: string; onChange: (value: string) => void; textareaKey: string; registerRef: (key: string, node: HTMLTextAreaElement | null) => void; onInsert: (variable: '{{nombre}}' | '{{nombre_completo}}') => void }) {
  return <label>{label}<textarea rows={label === 'Mensaje neutral' ? 5 : 3} value={value} onChange={(event) => onChange(event.target.value)} ref={(node) => registerRef(textareaKey, node)} /><span className="row variable-actions"><button type="button" className="secondary" onClick={() => onInsert('{{nombre}}')}>Insertar nombre</button><button type="button" className="secondary" onClick={() => onInsert('{{nombre_completo}}')}>Insertar nombre completo</button></span></label>
}
