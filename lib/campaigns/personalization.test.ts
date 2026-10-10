import { describe, expect, it } from 'vitest'
import { findUnsupportedVariables, resolveCampaignStep, resolveCampaignTemplate, resolveCampaignVariant } from './personalization'

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
  it('accepts supported image caption variables and rejects unknown ones', () => {
    expect(resolveCampaignTemplate('Hola {{nombre}}', snapshot).error).toBeUndefined()
    expect(resolveCampaignTemplate('Hola {{nombre_completo}}', snapshot).error).toBeUndefined()
    expect(resolveCampaignTemplate('Hola {{variable_inexistente}}', snapshot).error).toBe('VARIABLE_NO_COMPATIBLE')
  })
  it('uses the display name first token defensively', () => {
    expect(resolveCampaignTemplate('Hola {{nombre}}', { displayNameSnapshot: 'Carlos Rivera' }).value).toBe('Hola Carlos')
    expect(resolveCampaignTemplate('Hola {{nombre}}', {}).error).toBe('MISSING_RECIPIENT_NAME')
  })
  it('matches the DB variant and caption fallback rules', () => {
    const steps = [{ type: 'TEXT' as const, neutralText: 'Hola {{nombre}}', maleText: 'Qué tal {{nombre}}' }, { type: 'IMAGE' as const, neutralCaption: 'Mira esto', femaleCaption: 'Para ti, {{nombre}}' }]
    expect(resolveCampaignVariant('MALE', steps)).toBe('MALE')
    expect(resolveCampaignStep(steps[0], 'MALE', snapshot).text).toBe('Qué tal María')
    expect(resolveCampaignVariant('FEMALE', steps)).toBe('FEMALE')
    expect(resolveCampaignStep(steps[1], 'FEMALE', snapshot).caption).toBe('Para ti, María')
    expect(resolveCampaignStep(steps[1], 'NEUTRAL', snapshot).caption).toBe('Mira esto')
  })
})
