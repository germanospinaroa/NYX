import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')

describe('campaign intelligence UI contracts', () => {
  it('keeps campaign permission gating out of the active UX', () => {
    const workspace = read('app/app/contacts/contacts-workspace.tsx')
    const detail = read('app/app/contacts/[id]/contact-detail.tsx')
    const picker = read('app/app/campaigns/new/audience-picker.tsx')
    expect(workspace).not.toContain('Permiso WhatsApp')
    expect(workspace).not.toContain('Marcar permiso')
    expect(workspace).not.toContain('Origen del permiso')
    expect(detail).not.toContain('Permiso para campañas')
    expect(picker).not.toContain('Permiso WhatsApp')
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
