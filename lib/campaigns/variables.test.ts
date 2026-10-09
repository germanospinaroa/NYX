import { describe, expect, it } from 'vitest'
import { insertTemplateVariable } from './variables'

describe('campaign variable insertion', () => {
  it('replaces the active selection at the cursor', () => {
    expect(insertTemplateVariable('Hola mundo', 5, 10, '{{nombre}}')).toEqual({ value: 'Hola {{nombre}}', cursor: 15 })
    expect(insertTemplateVariable('Hola', 4, 4, '{{nombre_completo}}').value).toBe('Hola{{nombre_completo}}')
  })
})
