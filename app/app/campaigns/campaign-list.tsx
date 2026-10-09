'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CampaignSummary } from '@/lib/campaigns/monitor'
import { localDateTimeInputToUtc, scheduledRefreshDelay, toLocalDateTimeInputValue } from '@/lib/campaigns/scheduling'
import { Icon, StatusBadge } from '../ui'

type Campaign = CampaignSummary

function statusTone(status: string, sent: number) {
  if (status === 'COMPLETED') return 'success' as const
  if (status === 'FAILED') return sent > 0 ? 'warning' as const : 'danger' as const
  if (status === 'RUNNING' || status === 'QUEUED') return 'accent' as const
  if (status === 'PAUSED') return 'warning' as const
  return 'neutral' as const
}

export function CampaignList() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [error, setError] = useState<string | null>(null)
  const campaignsRef = useRef<Campaign[]>([])
  const inFlight = useRef(false)
  const controller = useRef<AbortController | null>(null)
  const [scheduleFor, setScheduleFor] = useState<string | null>(null)
  const [scheduleValue, setScheduleValue] = useState('')
  const [scheduleMin] = useState(() => toLocalDateTimeInputValue(new Date(Date.now() + 60000)))

  const load = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    controller.current?.abort()
    const nextController = new AbortController()
    controller.current = nextController
    try {
      const response = await fetch('/api/campaigns', { signal: nextController.signal, cache: 'no-store' })
      const body = await response.json().catch(() => ({})) as { campaigns?: Campaign[] }
      if (!response.ok) { setError('No fue posible actualizar campañas.'); return }
      const next = body.campaigns ?? []
      campaignsRef.current = next
      setCampaigns(next)
      setError(null)
    } catch (requestError) {
      if (!(requestError instanceof DOMException && requestError.name === 'AbortError')) setError('No fue posible actualizar campañas.')
    } finally { inFlight.current = false }
  }, [])

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void load()
    const refreshIfVisible = () => { if (document.visibilityState === 'visible') void load() }
    const interval = window.setInterval(() => {
      if (campaignsRef.current.some((campaign) => campaign.isPolling)) void load()
    }, 2000)
    window.addEventListener('focus', refreshIfVisible)
    document.addEventListener('visibilitychange', refreshIfVisible)
    return () => { window.clearInterval(interval); window.removeEventListener('focus', refreshIfVisible); document.removeEventListener('visibilitychange', refreshIfVisible); controller.current?.abort() }
  }, [load])
  useEffect(() => {
    const timers = campaigns.filter((campaign) => campaign.status === 'SCHEDULED' && campaign.scheduled_at).map((campaign) => window.setTimeout(() => void load(), scheduledRefreshDelay(campaign.scheduled_at as string) + 50))
    const fallback = window.setInterval(() => { if (campaignsRef.current.some((campaign) => campaign.status === 'SCHEDULED')) void load() }, 30000)
    return () => { timers.forEach((timer) => window.clearTimeout(timer)); window.clearInterval(fallback) }
  }, [campaigns, load])
  /* eslint-enable react-hooks/set-state-in-effect */

  async function action(id: string, actionName: 'START' | 'PAUSE' | 'RESUME' | 'CANCEL' | 'SCHEDULE', scheduledAt?: string) {
    const response = await fetch(`/api/campaigns/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: actionName, scheduledAt }) })
    if (response.ok) { setScheduleFor(null); setScheduleValue(''); void load() } else setError('No fue posible actualizar la campaña.')
  }

  return <div className="stack">
    {error && <div className="error" role="alert">{error}</div>}
    {campaigns.map((campaign) => <article className="card campaign-card" key={campaign.id}>
      <div className="row campaign-card-heading"><div><strong>{campaign.name || 'Campaña sin nombre'}</strong><StatusBadge status={campaign.humanStatus} tone={statusTone(campaign.status, campaign.sentRecipients)} /></div><Link className="compact-link secondary-link" href={`/app/campaigns/${campaign.id}`}>Ver detalle <Icon name="chevron-right" size={14} /></Link></div>
      <div className="campaign-progress-copy"><strong>{campaign.sentRecipients} de {campaign.totalRecipients} contactos completados</strong><span>{campaign.processedMessages} de {campaign.totalMessages} mensajes procesados</span></div>
      <div className="campaign-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={campaign.progressPercent}><span style={{ width: `${campaign.progressPercent}%` }} /></div>
      <div className="campaign-counts"><span>{campaign.sentRecipients} completados</span><span>{campaign.failedRecipients} fallidos</span><span>{campaign.unknownRecipients} resultado incierto</span><span>{campaign.pendingRecipients} pendientes</span></div>
      {campaign.status === 'SCHEDULED' && campaign.scheduled_at && <p className="campaign-schedule">Se enviará: {new Date(campaign.scheduled_at).toLocaleString()} · {Intl.DateTimeFormat().resolvedOptions().timeZone}</p>}
      <div className="row campaign-actions">{campaign.status === 'READY' && <><button className="secondary" onClick={() => void action(campaign.id, 'START')}>Enviar ahora</button><button className="secondary" onClick={() => setScheduleFor(campaign.id)}>Programar</button></>}{campaign.status === 'SCHEDULED' && <><button className="secondary" onClick={() => void action(campaign.id, 'START')}>Enviar ahora</button><button className="secondary" onClick={() => setScheduleFor(campaign.id)}>Cambiar programación</button><button className="secondary" onClick={() => void action(campaign.id, 'CANCEL')}>Cancelar</button></>}{campaign.status === 'PAUSED' ? <button className="secondary" onClick={() => void action(campaign.id, 'RESUME')}>Reanudar</button> : ['QUEUED', 'RUNNING'].includes(campaign.status) ? <button className="secondary" onClick={() => void action(campaign.id, 'PAUSE')}>Pausar</button> : null}{['QUEUED', 'RUNNING', 'PAUSED'].includes(campaign.status) && <button className="secondary" onClick={() => void action(campaign.id, 'CANCEL')}>Cancelar</button>}</div>
      {scheduleFor === campaign.id && <form className="schedule-form" onSubmit={(event) => { event.preventDefault(); if (scheduleValue) void action(campaign.id, 'SCHEDULE', localDateTimeInputToUtc(scheduleValue)) }}><label>Fecha y hora local<input type="datetime-local" value={scheduleValue} min={scheduleMin} onChange={(event) => setScheduleValue(event.target.value)} required /></label><span className="muted">Zona horaria: {Intl.DateTimeFormat().resolvedOptions().timeZone}</span><div className="row"><button type="submit">Programar campaña</button><button type="button" className="secondary" onClick={() => setScheduleFor(null)}>Cancelar</button></div></form>}
    </article>)}
    {!campaigns.length && <div className="card"><p>No hay campañas todavía.</p><Link href="/app/contacts">Elegir contactos</Link></div>}
  </div>
}
