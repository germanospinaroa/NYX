import { describe, expect, it } from 'vitest'
import { resolveIndividualMessageSteps } from './personalization'

describe('individual message personalization', () => {
  const snapshot = { firstNameSnapshot: 'María', displayNameSnapshot: 'María Fernanda Gómez' }

  it('resolves names in text and image captions before enqueue', () => {
    const result = resolveIndividualMessageSteps([
      { type: 'TEXT', text: 'Hola {{nombre}}' },
      { type: 'IMAGE', mediaPath: 'owner/image.webp', caption: 'Para {{nombre_completo}}' },
    ], snapshot)
    expect(result.error).toBeUndefined()
    expect(result.steps).toEqual([
      { type: 'TEXT', text: 'Hola María', caption: '' },
      { type: 'IMAGE', mediaPath: 'owner/image.webp', caption: 'Para María Fernanda Gómez', text: '' },
    ])
  })

  it('rejects unsupported variables without returning a raw-token send result', () => {
    const result = resolveIndividualMessageSteps([{ type: 'TEXT', text: 'Hola {{empresa}}' }], snapshot)
    expect(result.error).toBe('VARIABLE_NO_COMPATIBLE')
    expect(result.steps[0].text).toContain('{{empresa}}')
  })

  it('does not lose a missing-name error for nombre', () => {
    const result = resolveIndividualMessageSteps([{ type: 'TEXT', text: 'Hola {{nombre}}' }], { displayNameSnapshot: '' })
    expect(result.error).toBe('MISSING_RECIPIENT_NAME')
  })
})
