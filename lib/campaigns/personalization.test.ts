import { describe, expect, it } from 'vitest'
import { findUnsupportedVariables, resolveCampaignTemplate } from './personalization'

describe('campaign personalization', () => {
  const snapshot = { firstNameSnapshot: 'María', displayNameSnapshot: 'María Fernanda Gómez' }
  it('resolves short and full names without mutating the template', () => {
    const template = 'Hola {{nombre}}. Soy {{nombre_completo}}.'
    expect(resolveCampaignTemplate(template, snapshot).value).toBe('Hola María. Soy María Fernanda Gómez.')
    expect(template).toContain('{{nombre}}')
  })
  it('rejects unsupported variables', () => {
    expect(findUnsupportedVariables('Hola {{empresa}}')).toEqual(['empresa'])
    expect(resolveCampaignTemplate('Hola {{empresa}}', snapshot).error).toBe('VARIABLE_NO_COMPATIBLE')
  })
  it('uses the display name first token defensively', () => {
    expect(resolveCampaignTemplate('Hola {{nombre}}', { displayNameSnapshot: 'Carlos Rivera' }).value).toBe('Hola Carlos')
    expect(resolveCampaignTemplate('Hola {{nombre}}', {}).error).toBe('MISSING_RECIPIENT_NAME')
  })
})
