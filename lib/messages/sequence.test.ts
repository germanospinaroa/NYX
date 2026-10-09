import { describe, expect, it } from 'vitest'
import { moveStep, validateMessageSteps } from './sequence'

describe('message sequences', () => {
  it('validates text, image and empty steps', () => {
    expect(validateMessageSteps([])).toBeTruthy()
    expect(validateMessageSteps([{ type: 'TEXT' }])).toBeTruthy()
    expect(validateMessageSteps([{ type: 'IMAGE' }])).toBeTruthy()
    expect(validateMessageSteps([{ type: 'TEXT', text: 'Hola' }, { type: 'IMAGE', mediaPath: 'owner/file.png' }])).toBeNull()
  })
  it('reorders steps without mutating the original', () => {
    const steps = ['text', 'image', 'text-2']
    expect(moveStep(steps, 1, -1)).toEqual(['image', 'text', 'text-2'])
    expect(steps).toEqual(['text', 'image', 'text-2'])
  })
})
