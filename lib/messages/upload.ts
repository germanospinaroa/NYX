import { AUDIO_MIME_TYPES, isSupportedAudioMime } from './sequence'
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024
export const MAX_AUDIO_BYTES = 16 * 1024 * 1024

export function validateImageFile(file: { type: string; size: number }): string | null {
  if (!allowedTypes.has(file.type)) return 'Usa una imagen JPG, PNG o WebP.'
  if (file.size > MAX_IMAGE_BYTES) return 'La imagen debe pesar como máximo 8 MB.'
  return null
}

export function validateAudioFile(file: { type: string; size: number }): string | null {
  if (!isSupportedAudioMime(file.type)) return `Usa audio ${AUDIO_MIME_TYPES.map((mime) => mime.replace('audio/', '')).join(', ')}.`
  if (file.size > MAX_AUDIO_BYTES) return 'El audio debe pesar como máximo 16 MB.'
  return null
}
