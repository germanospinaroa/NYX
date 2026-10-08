import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const component = readFileSync(resolve(process.cwd(), 'app/app/imports/[id]/review/review-workspace.tsx'), 'utf8')
const styles = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8')

describe('review workspace UX contract', () => {
  it('offers reversible discard/restore through the existing dirty save flow', () => {
    expect(component).toContain('Descartar')
    expect(component).toContain('Restaurar')
    expect(component).toContain('updateDraft')
    expect(component).toContain('Guardar cambios')
  })

  it('uses a full-width desktop workspace and a mobile card layout', () => {
    expect(styles).toContain('.review-workspace')
    expect(styles).toContain('width: calc(100vw - 24px)')
    expect(styles).toContain('.review-mobile-card')
    expect(component).toContain('review-mobile-card')
  })

  it('keeps the compact comparison columns without a redundant review column', () => {
    expect(component).toContain('Nombre original')
    expect(component).toContain('Teléfono original')
    expect(component).toContain('>Nombre</th>')
    expect(component).not.toMatch(/<th[^>]*>Revisión<\/th>/u)
  })
})
