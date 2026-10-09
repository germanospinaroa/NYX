export type MessageStep = {
  type: 'TEXT' | 'IMAGE' | 'AUDIO'
  text?: string
  caption?: string
  mediaPath?: string
  mimeType?: string
  durationMs?: number
}

export function validateMessageSteps(steps: MessageStep[]): string | null {
  if (steps.length < 1 || steps.length > 50) return 'La secuencia debe tener entre 1 y 50 pasos.'
  for (const step of steps) {
    if (step.type === 'TEXT' && !step.text?.trim()) return 'Cada paso de texto necesita contenido.'
    if (step.type === 'IMAGE' && !step.mediaPath?.trim()) return 'Cada paso de imagen necesita un archivo.'
    if (step.type === 'AUDIO' && !step.mediaPath?.trim()) return 'Cada paso de audio necesita un archivo.'
    if (step.type === 'AUDIO' && step.mimeType && !isSupportedAudioMime(step.mimeType)) return 'Formato de audio no compatible.'
    if (step.durationMs !== undefined && (!Number.isFinite(step.durationMs) || step.durationMs < 0 || step.durationMs > 60 * 60 * 1000)) return 'La duración del audio no es válida.'
    if (!['TEXT', 'IMAGE', 'AUDIO'].includes(step.type)) return 'Tipo de paso inválido.'
  }
  return null
}

export const AUDIO_MIME_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg'] as const
export function isSupportedAudioMime(value: string): boolean { return (AUDIO_MIME_TYPES as readonly string[]).includes(value) }
export function selectSupportedAudioMimeType(mediaRecorder: { isTypeSupported?: (mime: string) => boolean } | undefined): string | null {
  if (!mediaRecorder?.isTypeSupported) return null
  return AUDIO_MIME_TYPES.find((mime) => mediaRecorder.isTypeSupported?.(mime)) ?? null
}

export function moveStep<T>(steps: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction
  if (index < 0 || index >= steps.length || target < 0 || target >= steps.length) return steps
  const next = [...steps]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}
