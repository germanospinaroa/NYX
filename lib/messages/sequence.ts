export type MessageStep = {
  type: 'TEXT' | 'IMAGE'
  text?: string
  caption?: string
  mediaPath?: string
}

export function validateMessageSteps(steps: MessageStep[]): string | null {
  if (steps.length < 1 || steps.length > 50) return 'La secuencia debe tener entre 1 y 50 pasos.'
  for (const step of steps) {
    if (step.type === 'TEXT' && !step.text?.trim()) return 'Cada paso de texto necesita contenido.'
    if (step.type === 'IMAGE' && !step.mediaPath?.trim()) return 'Cada paso de imagen necesita un archivo.'
    if (!['TEXT', 'IMAGE'].includes(step.type)) return 'Tipo de paso inválido.'
  }
  return null
}

export function moveStep<T>(steps: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction
  if (index < 0 || index >= steps.length || target < 0 || target >= steps.length) return steps
  const next = [...steps]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}
