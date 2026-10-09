import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')

describe('campaign intelligence UI contracts', () => {
  it('exposes permission filtering and explicit bulk permission actions', () => {
    const workspace = read('app/app/contacts/contacts-workspace.tsx')
    const detail = read('app/app/contacts/[id]/contact-detail.tsx')
    expect(workspace).toContain('Filtrar permiso WhatsApp')
    expect(workspace).toContain('Marcar permiso')
    expect(workspace).toContain('Origen del permiso')
    expect(detail).toContain('Permiso para campañas')
    expect(detail).toContain('Confirmado')
    expect(detail).toContain('No enviar')
  })

  it('keeps scheduling user-facing and out of browser timers', () => {
    const list = read('app/app/campaigns/campaign-list.tsx')
    const detail = read('app/app/campaigns/[id]/campaign-detail.tsx')
    expect(list).toContain('Programar campaña')
    expect(list).toContain('Enviar ahora')
    expect(detail).toContain('Cambiar programación')
    expect(detail).not.toContain('window.prompt')
  })
})
