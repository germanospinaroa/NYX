'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CampaignSummary } from '@/lib/campaigns/monitor'
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
  /* eslint-enable react-hooks/set-state-in-effect */

  async function action(id: string, actionName: 'START' | 'PAUSE' | 'RESUME' | 'CANCEL') {
    const response = await fetch(`/api/campaigns/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: actionName }) })
    if (response.ok) void load(); else setError('No fue posible actualizar la campaña.')
  }

  return <div className="stack">
    {error && <div className="error" role="alert">{error}</div>}
    {campaigns.map((campaign) => <article className="card campaign-card" key={campaign.id}>
      <div className="row campaign-card-heading"><div><strong>{campaign.name || 'Campaña sin nombre'}</strong><StatusBadge status={campaign.humanStatus} tone={statusTone(campaign.status, campaign.sentRecipients)} /></div><Link className="compact-link secondary-link" href={`/app/campaigns/${campaign.id}`}>Ver detalle <Icon name="chevron-right" size={14} /></Link></div>
      <div className="campaign-progress-copy"><strong>{campaign.sentRecipients} de {campaign.totalRecipients} contactos completados</strong><span>{campaign.processedMessages} de {campaign.totalMessages} mensajes procesados</span></div>
      <div className="campaign-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={campaign.progressPercent}><span style={{ width: `${campaign.progressPercent}%` }} /></div>
      <div className="campaign-counts"><span>{campaign.sentRecipients} completados</span><span>{campaign.failedRecipients} fallidos</span><span>{campaign.unknownRecipients} resultado incierto</span><span>{campaign.pendingRecipients} pendientes</span></div>
      <div className="row campaign-actions">{campaign.status === 'READY' && <button className="secondary" onClick={() => void action(campaign.id, 'START')}>Enviar campaña</button>}{campaign.status === 'PAUSED' ? <button className="secondary" onClick={() => void action(campaign.id, 'RESUME')}>Reanudar</button> : ['QUEUED', 'RUNNING'].includes(campaign.status) ? <button className="secondary" onClick={() => void action(campaign.id, 'PAUSE')}>Pausar</button> : null}{['QUEUED', 'RUNNING', 'PAUSED'].includes(campaign.status) && <button className="secondary" onClick={() => void action(campaign.id, 'CANCEL')}>Cancelar</button>}</div>
    </article>)}
    {!campaigns.length && <div className="card"><p>No hay campañas todavía.</p><Link href="/app/contacts">Elegir contactos</Link></div>}
  </div>
}
