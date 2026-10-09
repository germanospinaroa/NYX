import { describe, expect, it } from 'vitest'
import { insertTemplateVariable } from './variables'

describe('campaign variable insertion', () => {
  it('preserves existing text when inserting at a caret', () => {
    expect(insertTemplateVariable('Hola María, ¿cómo estás?', 5, 5, '{{nombre}}')).toEqual({ value: 'Hola {{nombre}}María, ¿cómo estás?', cursor: 15 })
  })

  it('replaces the active selection at the cursor', () => {
    expect(insertTemplateVariable('Hola mundo', 5, 10, '{{nombre}}')).toEqual({ value: 'Hola {{nombre}}', cursor: 15 })
    expect(insertTemplateVariable('Hola', 4, 4, '{{nombre_completo}}').value).toBe('Hola{{nombre_completo}}')
  })
})
