'use client'
/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useState } from 'react'
import { extractFirstHttpUrl } from '@/lib/links/extract'
import type { LinkMetadata } from '@/lib/links/preview'
import type { MessageStep } from '@/lib/messages/sequence'

const cache = new Map<string, LinkMetadata | null>()
type PreviewStep = MessageStep & { id?: string; previewUrl?: string }

function useLinkMetadata(text: string) {
  const url = useMemo(() => extractFirstHttpUrl(text), [text])
  const [metadata, setMetadata] = useState<LinkMetadata | null>(url ? cache.get(url) ?? null : null)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!url || cache.has(url)) return
    const timer = window.setTimeout(() => {
      setLoading(true)
      void fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
        .then((response) => response.ok ? response.json() as Promise<LinkMetadata> : null)
        .then((value) => { cache.set(url, value); setMetadata(value) })
        .catch(() => { cache.set(url, null); setMetadata(null) })
        .finally(() => setLoading(false))
    }, 650)
    return () => window.clearTimeout(timer)
  }, [url])
  return { url, metadata, loading }
}

function TextBubble({ step }: { step: MessageStep }) {
  const { url, metadata, loading } = useLinkMetadata(step.text ?? '')
  const parts = (step.text ?? '').split(/(https?:\/\/[^\s<>()]+)/giu)
  return <div className="conversation-bubble conversation-text-bubble">
    {loading && <div className="link-preview-skeleton" aria-label="Cargando vista previa" />}
    {metadata && <a className="link-preview-card" href={metadata.url} target="_blank" rel="noreferrer">{metadata.imageUrl && <img src={metadata.imageUrl} alt="" />}<strong>{metadata.title ?? metadata.hostname}</strong>{metadata.description && <span>{metadata.description}</span>}<small>{metadata.hostname}</small></a>}
    <p>{parts.map((part, index) => part === url ? <a key={index} href={part} target="_blank" rel="noreferrer">{part}</a> : <span key={index}>{part}</span>)}</p>
  </div>
}

export function ConversationPreview({ steps, recipient }: { steps: PreviewStep[]; recipient?: { name: string; phone?: string } }) {
  return <section className="conversation-preview" aria-label="Vista previa de la conversación">
    <header><span className="eyebrow">VISTA PREVIA</span><strong>Así se verá aproximadamente</strong>{recipient && <small>{recipient.name}{recipient.phone ? ` · ${recipient.phone}` : ''}</small>}</header>
    <div className="conversation-viewport">{steps.map((step, index) => <div className="conversation-message" key={step.id ?? `${step.type}-${index}`}>
      {step.type === 'TEXT' && <TextBubble step={step} />}
      {step.type === 'IMAGE' && <div className="conversation-bubble conversation-media-bubble">{step.previewUrl && <img src={step.previewUrl} alt="Vista previa de imagen" />}{step.caption && <p>{step.caption}</p>}</div>}
      {step.type === 'AUDIO' && <div className="conversation-bubble conversation-audio-bubble"><span aria-hidden="true">▶</span><div className="audio-wave" aria-hidden="true" /><time>{formatDuration(step.durationMs)}</time></div>}
    </div>)}</div>
  </section>
}

function formatDuration(ms?: number) { if (!ms) return '0:00'; const seconds = Math.round(ms / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` }
