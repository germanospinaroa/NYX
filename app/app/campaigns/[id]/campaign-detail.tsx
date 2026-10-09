'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { humanCampaignStatus, humanMessageStatus, humanRecipientStatus } from '@/lib/campaigns/monitor'

type Step = { index: number; type: string; status: string; attemptCount: number; createdAt: string; claimedAt: string | null; sentAt: string | null; failureReason: string | null; cancelledByPreviousFailure: boolean }
type Recipient = { id: string; contactId: string; contactName: string; status: string; steps: Step[] }
type Detail = { id: string; name: string | null; status: string; created_at: string; started_at: string | null; completed_at: string | null; totalRecipients: number; sentRecipients: number; failedRecipients: number; unknownRecipients: number; pendingRecipients: number; totalMessages: number; processedMessages: number; recipients: Recipient[] }

export function CampaignDetail({ campaignId }: { campaignId: string }) {
  const [campaign, setCampaign] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const inFlight = useRef(false)
  const controller = useRef<AbortController | null>(null)
  const campaignRef = useRef<Detail | null>(null)
  const load = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true; controller.current?.abort(); const nextController = new AbortController(); controller.current = nextController
    try { const response = await fetch(`/api/campaigns/${campaignId}`, { signal: nextController.signal, cache: 'no-store' }); const body = await response.json().catch(() => ({})) as { campaign?: Detail }; if (!response.ok || !body.campaign) { setError('No fue posible cargar el detalle de la campaña.'); return }; campaignRef.current = body.campaign; setCampaign(body.campaign); setError(null) }
    catch (requestError) { if (!(requestError instanceof DOMException && requestError.name === 'AbortError')) setError('No fue posible actualizar la campaña.') }
    finally { inFlight.current = false }
  }, [campaignId])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); const refreshIfVisible = () => { if (document.visibilityState === 'visible') void load() }; const interval = window.setInterval(() => { if (campaignRef.current && ['QUEUED', 'RUNNING', 'PAUSED'].includes(campaignRef.current.status)) void load() }, 2000); window.addEventListener('focus', refreshIfVisible); document.addEventListener('visibilitychange', refreshIfVisible); return () => { window.clearInterval(interval); window.removeEventListener('focus', refreshIfVisible); document.removeEventListener('visibilitychange', refreshIfVisible); controller.current?.abort() } }, [load])
  if (!campaign) return <div className="stack"><Link href="/app/campaigns">← Campañas</Link>{error ? <div className="error">{error}</div> : <div className="card">Cargando campaña…</div>}</div>
  const humanStatus = humanCampaignStatus(campaign.status, campaign.sentRecipients)
  return <div className="stack campaign-detail"><Link href="/app/campaigns">← Campañas</Link>{error && <div className="error" role="alert">{error}</div>}<div className="card"><div className="row campaign-detail-heading"><div><h1>{campaign.name || 'Campaña sin nombre'}</h1><p>{humanStatus}</p></div><span>{campaign.sentRecipients} de {campaign.totalRecipients} contactos completados</span></div><div className="summary-grid"><div className="metric"><strong>{campaign.sentRecipients}</strong><span>Enviados</span></div><div className="metric"><strong>{campaign.failedRecipients}</strong><span>Fallidos</span></div><div className="metric"><strong>{campaign.unknownRecipients}</strong><span>Resultado incierto</span></div><div className="metric"><strong>{campaign.pendingRecipients}</strong><span>Pendientes</span></div><div className="metric"><strong>{campaign.processedMessages}/{campaign.totalMessages}</strong><span>Mensajes procesados</span></div></div><p className="campaign-dates">Creada: {new Date(campaign.created_at).toLocaleString()} {campaign.started_at && ` · Inicio: ${new Date(campaign.started_at).toLocaleString()}`} {campaign.completed_at && ` · Fin: ${new Date(campaign.completed_at).toLocaleString()}`}</p></div><div className="stack"><h2>Destinatarios</h2>{campaign.recipients.map((recipient) => { const hasSentSteps = recipient.steps.some((step) => step.status === 'SENT'); return <article className="card recipient-monitor-row" key={recipient.id}><button className="recipient-toggle" onClick={() => setOpen((current) => ({ ...current, [recipient.id]: !current[recipient.id] }))} aria-expanded={Boolean(open[recipient.id])}><span><strong>{recipient.contactName}</strong><small>{humanRecipientStatus(recipient.status, hasSentSteps)} · {recipient.steps.filter((step) => step.status === 'SENT').length}/{recipient.steps.length} pasos enviados</small></span><span>{open[recipient.id] ? 'Ocultar' : 'Ver pasos'}</span></button>{open[recipient.id] && <div className="recipient-steps">{recipient.steps.map((step) => <div className="recipient-step" key={`${recipient.id}-${step.index}`}><div><strong>Paso {step.index + 1} · {step.type === 'IMAGE' ? 'Imagen' : 'Texto'}</strong><span>{humanMessageStatus(step.status)}</span></div>{step.failureReason && <small>{step.failureReason}</small>}{step.cancelledByPreviousFailure && <small>No enviado porque un paso anterior falló</small>}</div>)}</div>}</article>})}</div></div>
}
