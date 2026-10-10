'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { humanCampaignStatus, humanMessageStatus, humanMessageType, humanRecipientStatus } from '@/lib/campaigns/monitor'
import { localDateTimeInputToUtc, scheduledRefreshDelay, toLocalDateTimeInputValue } from '@/lib/campaigns/scheduling'
import { Icon, StatusBadge } from '../../ui'

type Step = { index: number; type: string; status: string; attemptCount: number; createdAt: string; claimedAt: string | null; sentAt: string | null; failureReason: string | null; cancelledByPreviousFailure: boolean }
type Recipient = { id: string; contactId: string; contactName: string; contentVariantKey: string; status: string; steps: Step[] }
type VariantSummary = { key: string; recipients: number; completed: number; failed: number; unknown: number; pending: number; sentMessages: number }
type Detail = { id: string; name: string | null; status: string; created_at: string; started_at: string | null; completed_at: string | null; scheduled_at?: string | null; totalRecipients: number; sentRecipients: number; failedRecipients: number; unknownRecipients: number; pendingRecipients: number; totalSteps: number; totalMessages: number; processedMessages: number; variantSummaries?: VariantSummary[]; recipients: Recipient[] }

function toneFor(status: string, completed: number) {
  if (status === 'COMPLETED') return 'success' as const
  if (status === 'FAILED') return completed > 0 ? 'warning' as const : 'danger' as const
  if (status === 'RUNNING' || status === 'QUEUED') return 'accent' as const
  if (status === 'PAUSED') return 'warning' as const
  return 'neutral' as const
}

export function CampaignDetail({ campaignId }: { campaignId: string }) {
  const [campaign, setCampaign] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [scheduleValue, setScheduleValue] = useState('')
  const [rescheduling, setRescheduling] = useState(false)
  const [scheduleMin] = useState(() => toLocalDateTimeInputValue(new Date(Date.now() + 60000)))
  const inFlight = useRef(false)
  const controller = useRef<AbortController | null>(null)
  const campaignRef = useRef<Detail | null>(null)

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

  if (!campaign) return <div className="stack"><Link className="back-link" href="/app/campaigns"><Icon name="arrow-left" size={16} />Campañas</Link>{error ? <div className="error" role="alert">{error}</div> : <div className="detail-skeleton"><span /><span /><span /></div>}</div>
  const currentCampaign = campaign

  async function action(actionName: 'START' | 'SCHEDULE' | 'CANCEL') {
    const response = await fetch(`/api/campaigns/${currentCampaign.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: actionName, scheduledAt: actionName === 'SCHEDULE' ? localDateTimeInputToUtc(scheduleValue) : undefined }) })
    if (response.ok) { setScheduleValue(''); setRescheduling(false); void load() } else setError('No fue posible actualizar la campaña.')
  }

  const humanStatus = humanCampaignStatus(campaign.status, campaign.sentRecipients)
  return <div className="stack campaign-detail">
    <Link className="back-link" href="/app/campaigns"><Icon name="arrow-left" size={16} />Campañas</Link>
    {error && <div className="error" role="alert">{error}</div>}
    <div className="card campaign-hero"><div className="campaign-detail-heading"><div><span className="eyebrow">MONITOR DE CAMPAÑA</span><h1>{campaign.name || 'Campaña sin nombre'}</h1><StatusBadge status={humanStatus} tone={toneFor(campaign.status, campaign.sentRecipients)} /></div><span className="campaign-total">{campaign.sentRecipients} de {campaign.totalRecipients} contactos completados</span></div><div className="summary-grid"><div className="metric"><strong>{campaign.sentRecipients}</strong><span>Completados</span></div><div className="metric"><strong>{campaign.failedRecipients}</strong><span>Fallidos</span></div><div className="metric"><strong>{campaign.unknownRecipients}</strong><span>Resultado incierto</span></div><div className="metric"><strong>{campaign.pendingRecipients}</strong><span>Pendientes</span></div><div className="metric"><strong>{campaign.processedMessages}/{campaign.totalMessages}</strong><span>Mensajes procesados</span></div></div><p className="campaign-dates">Creada: {new Date(campaign.created_at).toLocaleString()} {campaign.started_at && ` · Inicio: ${new Date(campaign.started_at).toLocaleString()}`} {campaign.completed_at && ` · Fin: ${new Date(campaign.completed_at).toLocaleString()}`}</p>{campaign.status === 'READY' && <div className="schedule-detail"><strong>Campaña preparada</strong><span>{campaign.totalRecipients} personas elegibles · {campaign.totalSteps} pasos</span><div className="row"><button onClick={() => void action('START')}>Enviar ahora</button><button className="secondary" onClick={() => setRescheduling((value) => !value)}>Programar</button></div>{rescheduling && <form className="schedule-form" onSubmit={(event) => { event.preventDefault(); if (scheduleValue) void action('SCHEDULE') }}><label>Fecha y hora local<input type="datetime-local" value={scheduleValue} min={scheduleMin} onChange={(event) => setScheduleValue(event.target.value)} required /></label><span className="muted">Zona horaria: {Intl.DateTimeFormat().resolvedOptions().timeZone}</span><button type="submit">Programar campaña</button></form>}</div>}{campaign.status === 'SCHEDULED' && campaign.scheduled_at && <div className="schedule-detail"><strong>Se enviará: {new Date(campaign.scheduled_at).toLocaleString()}</strong><span>Zona horaria: {Intl.DateTimeFormat().resolvedOptions().timeZone}</span><div className="row"><button className="secondary" onClick={() => void action('START')}>Enviar ahora</button><button className="secondary" onClick={() => setRescheduling((value) => !value)}>Cambiar programación</button><button className="secondary" onClick={() => void action('CANCEL')}>Cancelar</button></div>{rescheduling && <form className="schedule-form" onSubmit={(event) => { event.preventDefault(); if (scheduleValue) void action('SCHEDULE') }}><label>Nueva fecha y hora local<input type="datetime-local" value={scheduleValue} min={scheduleMin} onChange={(event) => setScheduleValue(event.target.value)} required /></label><span className="muted">Zona horaria: {Intl.DateTimeFormat().resolvedOptions().timeZone}</span><button type="submit">Guardar programación</button></form>}</div>}</div>
    {campaign.variantSummaries?.length ? <section className="campaign-variant-summary panel"><div className="section-heading"><div><span className="eyebrow">VARIANTES</span><h2>Distribución</h2></div></div><div className="row">{campaign.variantSummaries.map((variant) => <div className="metric" key={variant.key}><strong>Versión {variant.key}</strong><span>{variant.recipients} personas · {variant.completed} completadas · {variant.failed} fallidas · {variant.unknown} inciertas · {variant.pending} pendientes</span><small>{variant.sentMessages} mensajes enviados</small></div>)}</div></section> : null}
    <div className="stack"><div className="section-heading"><div><span className="eyebrow">AUDIENCIA</span><h2>Destinatarios</h2></div><span className="muted">{campaign.totalRecipients} personas</span></div>{campaign.recipients.map((recipient) => { const hasSentSteps = recipient.steps.some((step) => step.status === 'SENT'); const sent = recipient.steps.filter((step) => step.status === 'SENT').length; return <article className="card recipient-monitor-row" key={recipient.id}><button className="recipient-toggle" onClick={() => setOpen((current) => ({ ...current, [recipient.id]: !current[recipient.id] }))} aria-expanded={Boolean(open[recipient.id])}><span className="recipient-person"><span className="avatar">{recipient.contactName.slice(0, 2).toUpperCase()}</span><span><strong>{recipient.contactName}</strong><small>Versión {recipient.contentVariantKey} · {humanRecipientStatus(recipient.status, hasSentSteps)} · {sent}/{recipient.steps.length} pasos completados</small></span></span><Icon name={open[recipient.id] ? 'chevron-down' : 'chevron-right'} size={17} /></button>{open[recipient.id] && <div className="recipient-steps">{recipient.steps.map((step) => <div className="recipient-step" key={`${recipient.id}-${step.index}`}><div><strong>Paso {step.index + 1} · {humanMessageType(step.type)}</strong><StatusBadge status={humanMessageStatus(step.status)} tone={step.status === 'SENT' ? 'success' : step.status === 'FAILED' ? 'danger' : step.status === 'OUTCOME_UNKNOWN' ? 'warning' : 'neutral'} /></div>{step.failureReason && <small>{step.failureReason}</small>}{step.cancelledByPreviousFailure && <small>No enviado porque un paso anterior falló</small>}</div>)}</div>}</article>})}</div>
  </div>
}
