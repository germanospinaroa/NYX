'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { countRecipientsByFilter, filterRecipients, humanCampaignStatus, humanMessageStatus, humanMessageType, humanRecipientStatus, initials, type RecipientFilter } from '@/lib/campaigns/monitor'
import { localDateTimeInputToUtc, scheduledRefreshDelay, toLocalDateTimeInputValue } from '@/lib/campaigns/scheduling'
import { Icon, StatusBadge, useOperationalStatus } from '../../ui'

type Step = { index: number; type: string; status: string; attemptCount: number; createdAt: string; claimedAt: string | null; sentAt: string | null; failureReason: string | null; cancelledByPreviousFailure: boolean }
type Recipient = { id: string; contactId: string; contactName: string; contactPhone: string | null; contentVariantKey: string; status: string; steps: Step[] }
type VariantSummary = { key: string; recipients: number; completed: number; failed: number; unknown: number; pending: number; sentMessages: number }
type Detail = { id: string; name: string | null; status: string; pause_requested?: boolean; activeDispatches?: number; created_at: string; started_at: string | null; completed_at: string | null; scheduled_at?: string | null; totalRecipients: number; sentRecipients: number; failedRecipients: number; unknownRecipients: number; pendingRecipients: number; totalSteps: number; totalMessages: number; processedMessages: number; unknownMessages: number; pendingMessages: number; variantSummaries?: VariantSummary[]; recipients: Recipient[] }

function toneFor(status: string, completed: number) {
  if (status === 'COMPLETED') return 'success' as const
  if (status === 'FAILED') return completed > 0 ? 'warning' as const : 'danger' as const
  if (status === 'RUNNING' || status === 'QUEUED') return 'accent' as const
  if (status === 'PAUSED') return 'warning' as const
  return 'neutral' as const
}

function MessageProcessingSummary({ processed, total, unknown, pending }: { processed: number; total: number; unknown: number; pending: number }) {
  return <div className="message-processing-summary" aria-label="Resumen de mensajes"><span><strong>{processed}/{total}</strong> procesados</span><span><strong>{unknown}</strong> inciertos</span><span><strong>{pending}</strong> pendientes</span></div>
}

export function CampaignDetail({ campaignId }: { campaignId: string }) {
  const [campaign, setCampaign] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [scheduleValue, setScheduleValue] = useState('')
  const [rescheduling, setRescheduling] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [recipientFilter, setRecipientFilter] = useState<RecipientFilter>('ALL')
  const [scheduleMin] = useState(() => toLocalDateTimeInputValue(new Date(Date.now() + 60000)))
  const inFlight = useRef(false)
  const controller = useRef<AbortController | null>(null)
  const campaignRef = useRef<Detail | null>(null)
  const operational = useOperationalStatus()

  const load = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    controller.current?.abort()
    const nextController = new AbortController()
    controller.current = nextController
    try {
      const response = await fetch(`/api/campaigns/${campaignId}`, { signal: nextController.signal, cache: 'no-store' })
      const body = await response.json().catch(() => ({})) as { campaign?: Detail }
      if (!response.ok || !body.campaign) { setError('No fue posible cargar el detalle de la campaña.'); return }
      campaignRef.current = body.campaign
      setCampaign(body.campaign)
      setError(null)
    } catch (requestError) {
      if (!(requestError instanceof DOMException && requestError.name === 'AbortError')) setError('No fue posible actualizar la campaña.')
    } finally { inFlight.current = false }
  }, [campaignId])

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void load()
    const refreshIfVisible = () => { if (document.visibilityState === 'visible') void load() }
    const interval = window.setInterval(() => { if (campaignRef.current && ['QUEUED', 'RUNNING', 'PAUSED'].includes(campaignRef.current.status)) void load() }, 2000)
    window.addEventListener('focus', refreshIfVisible)
    document.addEventListener('visibilitychange', refreshIfVisible)
    return () => { window.clearInterval(interval); window.removeEventListener('focus', refreshIfVisible); document.removeEventListener('visibilitychange', refreshIfVisible); controller.current?.abort() }
  }, [load])

  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!campaign || campaign.status !== 'SCHEDULED' || !campaign.scheduled_at) return
    const timer = window.setTimeout(() => void load(), scheduledRefreshDelay(campaign.scheduled_at) + 50)
    const fallback = window.setInterval(() => void load(), 30000)
    return () => { window.clearTimeout(timer); window.clearInterval(fallback) }
  }, [campaign, load])

  const visibleRecipients = useMemo(() => filterRecipients(campaign?.recipients ?? [], recipientFilter), [campaign?.recipients, recipientFilter])

  if (!campaign) return <div className="stack"><Link className="back-link" href="/app/campaigns"><Icon name="arrow-left" size={16} />Campañas</Link>{error ? <div className="error" role="alert">{error}</div> : <div className="detail-skeleton"><span /><span /><span /></div>}</div>
  const currentCampaign = campaign
  const recipientCounts = {
    SENT: countRecipientsByFilter(currentCampaign.recipients, 'SENT'),
    FAILED: countRecipientsByFilter(currentCampaign.recipients, 'FAILED'),
    OUTCOME_UNKNOWN: countRecipientsByFilter(currentCampaign.recipients, 'OUTCOME_UNKNOWN'),
    PENDING: countRecipientsByFilter(currentCampaign.recipients, 'PENDING'),
  }
  const filterLabels: Record<RecipientFilter, string> = { ALL: 'Todos', SENT: 'Completados', FAILED: 'Fallidos', OUTCOME_UNKNOWN: 'Resultado incierto', PENDING: 'Pendientes' }

  async function action(actionName: 'START' | 'PAUSE' | 'RESUME' | 'SCHEDULE' | 'CANCEL') {
    if ((actionName === 'START' || actionName === 'RESUME') && !operational.canProcess) { setError('El procesamiento está bloqueado hasta verificar WhatsApp conectado y un worker activo.'); return }
    if (actionName === 'RESUME' && !window.confirm('¿Quieres reanudar esta campaña? Se habilitarán sus mensajes pendientes para el worker.')) return
    if (actionName === 'CANCEL' && !window.confirm('¿Quieres detener definitivamente esta campaña? Los mensajes que todavía no se hayan enviado se cancelarán. Los mensajes ya procesados conservarán su historial. Esta acción no se puede deshacer.')) return
    setActionBusy(true)
    try {
      const response = await fetch(`/api/campaigns/${currentCampaign.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: actionName, scheduledAt: actionName === 'SCHEDULE' ? localDateTimeInputToUtc(scheduleValue) : undefined }) })
      if (response.ok) { setScheduleValue(''); setRescheduling(false); void load() } else if (response.status === 409 && actionName === 'PAUSE') setError('La pausa fue solicitada. Hay un despacho en curso; se confirmará cuando termine.')
      else setError('No fue posible actualizar la campaña.')
    } finally { setActionBusy(false) }
  }

  const humanStatus = humanCampaignStatus(campaign.status, campaign.sentRecipients)
  return <div className="stack campaign-detail">
    <div className="row campaign-detail-actions"><Link className="back-link" href="/app/campaigns"><Icon name="arrow-left" size={16} />Campañas</Link><Link className="secondary-link" href={`/app/campaigns/new?from=${campaign.id}`}>Reutilizar campaña</Link></div>
    {error && <div className="error" role="alert">{error}</div>}
    <div className="panel connection-panel"><span className={`connection-dot connection-${operational.state.toLowerCase()}`} aria-hidden="true" /><strong>Procesamiento: {operational.canProcess ? 'Listo' : 'Bloqueado'}</strong><span className="muted">WhatsApp {operational.state === 'CONNECTED' ? 'conectado' : 'no verificado'} · {operational.worker.state === 'RUNNING' ? 'worker activo' : 'worker no verificado'}</span></div>
    <div className="row campaign-control-bar" aria-label="Controles de campaña">
      {campaign.status === 'READY' && <><Link className="secondary" href={`/app/campaigns/${campaign.id}/edit`}>Editar campaña</Link><button disabled={actionBusy || !operational.canProcess} onClick={() => void action('START')}>Enviar ahora</button><button className="secondary" disabled={actionBusy || !operational.canProcess} onClick={() => setRescheduling((value) => !value)}>Programar</button></>}
      {(campaign.status === 'QUEUED' || campaign.status === 'RUNNING') && <><button disabled={actionBusy} onClick={() => void action('PAUSE')}><Icon name="pause" size={15} />Pausar campaña</button><button className="secondary danger-button" disabled={actionBusy} onClick={() => void action('CANCEL')}>Detener campaña</button></>}
      {campaign.status === 'PAUSED' && <><button disabled={actionBusy || !operational.canProcess} onClick={() => void action('RESUME')}><Icon name="play" size={15} />Reanudar campaña</button><button className="secondary danger-button" disabled={actionBusy} onClick={() => void action('CANCEL')}>Detener campaña</button></>}
      {campaign.status === 'SCHEDULED' && <button className="secondary danger-button" disabled={actionBusy} onClick={() => void action('CANCEL')}>Cancelar programación</button>}
      {['COMPLETED', 'FAILED', 'CANCELLED'].includes(campaign.status) && <Link className="secondary" href={`/app/campaigns/new?from=${campaign.id}`}>Reutilizar campaña</Link>}
    </div>
    <MessageProcessingSummary processed={campaign.processedMessages} total={campaign.totalMessages} unknown={campaign.unknownMessages} pending={campaign.pendingMessages} />
    <div className="card campaign-hero"><div className="campaign-detail-heading"><div><span className="eyebrow">MONITOR DE CAMPAÑA</span><h1>{campaign.name || 'Campaña sin nombre'}</h1><StatusBadge status={humanStatus} tone={toneFor(campaign.status, campaign.sentRecipients)} /></div><span className="campaign-total">{campaign.sentRecipients} de {campaign.totalRecipients} contactos completados</span></div><div className="summary-grid" role="group" aria-label="Filtrar destinatarios"><button className={`metric metric-filter ${recipientFilter === 'SENT' ? 'active' : ''}`} aria-pressed={recipientFilter === 'SENT'} onClick={() => setRecipientFilter('SENT')}><strong>{recipientCounts.SENT}</strong><span>Completados</span></button><button className={`metric metric-filter ${recipientFilter === 'FAILED' ? 'active' : ''}`} aria-pressed={recipientFilter === 'FAILED'} onClick={() => setRecipientFilter('FAILED')}><strong>{recipientCounts.FAILED}</strong><span>Fallidos</span></button><button className={`metric metric-filter ${recipientFilter === 'OUTCOME_UNKNOWN' ? 'active' : ''}`} aria-pressed={recipientFilter === 'OUTCOME_UNKNOWN'}><strong>{recipientCounts.OUTCOME_UNKNOWN}</strong><span>Resultado incierto</span></button><button className={`metric metric-filter ${recipientFilter === 'PENDING' ? 'active' : ''}`} aria-pressed={recipientFilter === 'PENDING'}><strong>{recipientCounts.PENDING}</strong><span>Pendientes</span></button><div className="metric"><strong>{campaign.processedMessages}/{campaign.totalMessages}</strong><span>Mensajes procesados</span></div></div><p className="campaign-dates">Creada: {new Date(campaign.created_at).toLocaleString()} {campaign.started_at && ` · Inicio: ${new Date(campaign.started_at).toLocaleString()}`} {campaign.completed_at && ` · Fin: ${new Date(campaign.completed_at).toLocaleString()}`}</p><p className="muted campaign-status-note">Los mensajes procesados incluyen enviados, fallidos, cancelados y resultados inciertos. Un resultado incierto significa que el proveedor pudo aceptar el envío, pero NYX no obtuvo confirmación segura; no se reintenta automáticamente.</p>{campaign.status === 'READY' && <div className="schedule-detail"><strong>Campaña preparada</strong><span>{campaign.totalRecipients} personas elegibles · {campaign.totalSteps} pasos</span><div className="row"><button disabled={actionBusy || !operational.canProcess} onClick={() => void action('START')}>Enviar ahora</button><button className="secondary" disabled={actionBusy || !operational.canProcess} onClick={() => setRescheduling((value) => !value)}>Programar</button></div>{rescheduling && <form className="schedule-form" onSubmit={(event) => { event.preventDefault(); if (scheduleValue) void action('SCHEDULE') }}><label>Fecha y hora local<input type="datetime-local" value={scheduleValue} min={scheduleMin} onChange={(event) => setScheduleValue(event.target.value)} required /></label><span className="muted">Zona horaria: {Intl.DateTimeFormat().resolvedOptions().timeZone}</span><button type="submit">Programar campaña</button></form>}</div>}{campaign.status === 'SCHEDULED' && campaign.scheduled_at && <div className="schedule-detail"><strong>Se enviará: {new Date(campaign.scheduled_at).toLocaleString()}</strong><span>Zona horaria: {Intl.DateTimeFormat().resolvedOptions().timeZone}</span><div className="row"><button className="secondary" disabled={actionBusy || !operational.canProcess} onClick={() => void action('START')}>Enviar ahora</button><button className="secondary" disabled={actionBusy || !operational.canProcess} onClick={() => setRescheduling((value) => !value)}>Cambiar programación</button><button className="secondary" onClick={() => void action('CANCEL')}>Cancelar</button></div>{rescheduling && <form className="schedule-form" onSubmit={(event) => { event.preventDefault(); if (scheduleValue) void action('SCHEDULE') }}><label>Nueva fecha y hora local<input type="datetime-local" value={scheduleValue} min={scheduleMin} onChange={(event) => setScheduleValue(event.target.value)} required /></label><span className="muted">Zona horaria: {Intl.DateTimeFormat().resolvedOptions().timeZone}</span><button type="submit">Guardar programación</button></form>}</div>}</div>
    {campaign.variantSummaries?.length ? <section className="campaign-variant-summary panel"><div className="section-heading"><div><span className="eyebrow">VARIANTES</span><h2>Distribución</h2></div></div><div className="row">{campaign.variantSummaries.map((variant) => <div className="metric" key={variant.key}><strong>Versión {variant.key}</strong><span>{variant.recipients} personas · {variant.completed} completadas · {variant.failed} fallidas · {variant.unknown} inciertas · {variant.pending} pendientes</span><small>{variant.sentMessages} mensajes enviados</small></div>)}</div></section> : null}
    <div className="stack"><div className="section-heading"><div><span className="eyebrow">AUDIENCIA</span><h2>Destinatarios</h2></div><div className="row audience-controls"><span className="muted" aria-live="polite">{visibleRecipients.length} de {campaign.totalRecipients} personas · {filterLabels[recipientFilter]}</span>{recipientFilter !== 'ALL' && <button className="ghost" onClick={() => setRecipientFilter('ALL')}>Ver todos</button>}</div></div>{visibleRecipients.length === 0 ? <div className="card empty-state" role="status">No hay destinatarios con el filtro «{filterLabels[recipientFilter]}».</div> : visibleRecipients.map((recipient) => { const hasSentSteps = recipient.steps.some((step) => step.status === 'SENT'); const sent = recipient.steps.filter((step) => step.status === 'SENT').length; const failedStep = recipient.steps.find((step) => step.status === 'FAILED' || step.status === 'OUTCOME_UNKNOWN'); const isFailed = recipient.status === 'FAILED'; return <article className={`card recipient-monitor-row ${isFailed ? 'recipient-failed' : ''}`} key={recipient.id}><button className="recipient-toggle" onClick={() => setOpen((current) => ({ ...current, [recipient.id]: !current[recipient.id] }))} aria-expanded={Boolean(open[recipient.id])}><span className="recipient-person"><span className="avatar">{initials(recipient.contactName)}</span><span><strong>{recipient.contactName}</strong><small className="recipient-status-line">Versión {recipient.contentVariantKey} · {humanRecipientStatus(recipient.status, hasSentSteps)} · {sent}/{recipient.steps.length} pasos completados</small>{recipientFilter === 'FAILED' && <small>{recipient.contactPhone ?? 'Teléfono no disponible'}</small>}</span></span><Icon name={open[recipient.id] ? 'chevron-down' : 'chevron-right'} size={17} /></button>{isFailed && <div className="recipient-issue"><strong>Incidencia: {failedStep ? `Paso ${failedStep.index + 1} · ${humanMessageStatus(failedStep.status)}` : 'No se pudo completar'}</strong>{failedStep?.failureReason && <span>{failedStep.failureReason}</span>}<span>{sent} de {recipient.steps.length} pasos enviados correctamente</span></div>}{open[recipient.id] && <div className="recipient-steps"><div className="recipient-identity"><span className="muted">Teléfono</span><strong>{recipient.contactPhone ?? 'Teléfono no disponible'}</strong></div>{recipient.steps.map((step) => <div className="recipient-step" key={`${recipient.id}-${step.index}`}><div><strong>Paso {step.index + 1} · {humanMessageType(step.type)}</strong><StatusBadge status={humanMessageStatus(step.status)} tone={step.status === 'SENT' ? 'success' : step.status === 'FAILED' ? 'danger' : step.status === 'OUTCOME_UNKNOWN' ? 'warning' : 'neutral'} /></div>{step.failureReason && <small>{step.failureReason}</small>}{step.cancelledByPreviousFailure && <small>No enviado porque un paso anterior falló</small>}</div>)}</div>}</article>})}</div>
  </div>
}
