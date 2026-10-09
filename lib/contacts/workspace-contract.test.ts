import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const workspace = readFileSync(resolve(process.cwd(), 'app/app/contacts/contacts-workspace.tsx'), 'utf8')
const contactsRoute = readFileSync(resolve(process.cwd(), 'app/api/contacts/route.ts'), 'utf8')
const labelRoute = readFileSync(resolve(process.cwd(), 'app/api/contacts/labels/route.ts'), 'utf8')
const genderRoute = readFileSync(resolve(process.cwd(), 'app/api/contacts/gender/route.ts'), 'utf8')
const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261008100000_review_workspace_gender_labels.sql'), 'utf8')

describe('contacts operating workspace contract', () => {
  it('keeps search, gender, label and combined filters server-side with real counts', () => {
    expect(contactsRoute).toContain("rpc('get_contacts_workspace'")
    expect(contactsRoute).toContain("p_q: query")
    expect(contactsRoute).toContain("p_permission: null")
    expect(workspace).toContain('contactos coinciden')
    expect(workspace).toContain('query, gender, labelId')
    expect(workspace).not.toContain('Permiso WhatsApp')
  })

  it('selects all filtered results through a filter descriptor and batch RPCs', () => {
    expect(workspace).toContain('Seleccionar los {total} resultados')
    expect(workspace).toContain("mode: 'filter'")
    expect(labelRoute).toContain("bulk_set_contact_label")
    expect(genderRoute).toContain("bulk_update_contact_gender")
    expect(labelRoute).not.toMatch(/for\s*\([^)]*contact/iu)
    expect(genderRoute).not.toMatch(/for\s*\([^)]*contact/iu)
  })

  it('does not silently truncate large filtered selections', () => {
    const selection = readFileSync(resolve(process.cwd(), 'lib/contacts/selection.ts'), 'utf8')
    expect(selection).toContain("rpc('resolve_contact_ids_for_selection'")
    expect(selection).not.toContain('limit(10000)')
  })

  it('rejects invalid server-side filter values', () => {
    expect(contactsRoute).toContain("INVALID_GENDER_FILTER")
    expect(contactsRoute).toContain("INVALID_LABEL_FILTER")
  })

  it('keeps labels and gender owner-scoped through existing invoker RPCs', () => {
    expect(migration).toContain('where c.owner_id = v_owner_id and c.id = any(p_contact_ids)')
    expect(migration).toContain('where owner_id = v_owner_id and id = any(p_contact_ids)')
    expect(migration).toContain('security invoker')
    expect(workspace).toContain('Asignar label')
    expect(workspace).toContain('Quitar label')
    expect(workspace).toContain('Hombre')
    expect(workspace).toContain('Mujer')
    expect(workspace).toContain('Desconocido')
  })

  it('separates filtering labels from mutation labels and exposes row actions', () => {
    expect(workspace).toContain('Filtrar por label')
    expect(workspace).toContain('Label para asignar/quitar')
    expect(workspace).toContain('Acciones para')
    expect(workspace).toContain("'/message'")
    expect(workspace).toContain('>Mensaje</')
    expect(workspace).toContain('>Ver</')
    expect(workspace).not.toContain('>Campaña</button>')
  })

  it('preserves label filter semantics for a synthetic owner-scoped relation', () => {
    const contacts = [
      { id: 'a', labels: ['x'] },
      { id: 'b', labels: [] },
      { id: 'c', labels: ['y'] },
    ]
    const result = contacts.filter((contact) => contact.labels.includes('x'))
    expect(result.map((contact) => contact.id)).toEqual(['a'])
    expect(result).toHaveLength(1)
  })
})
