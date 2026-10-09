const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024

export function validateImageFile(file: { type: string; size: number }): string | null {
  if (!allowedTypes.has(file.type)) return 'Usa una imagen JPG, PNG o WebP.'
  if (file.size > MAX_IMAGE_BYTES) return 'La imagen debe pesar como máximo 8 MB.'
  return null
}
