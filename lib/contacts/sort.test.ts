import { describe, expect, it } from 'vitest'
import { compareNames, comparePeopleByName } from './sort'

describe('people alphabetical ordering', () => {
  it('sorts by the first visible token, case-insensitively and without accent weight', () => {
    const people = [
      { id: '5', display_name: 'Sandra Milena Peña' },
      { id: '2', display_name: 'Álvaro' },
      { id: '7', display_name: 'Zulema Andrade' },
      { id: '1', display_name: 'Alberto' },
      { id: '3', display_name: 'Érika' },
      { id: '4', display_name: 'Ernesto' },
      { id: '6', display_name: 'Óscar' },
      { id: '8', display_name: 'Omar' },
    ]
    expect(people.sort(comparePeopleByName).map((person) => person.display_name)).toEqual([
      'Alberto', 'Álvaro', 'Érika', 'Ernesto', 'Omar', 'Óscar', 'Sandra Milena Peña', 'Zulema Andrade',
    ])
  })

  it('uses a stable id tie-breaker for equal visible names', () => {
    expect([
      { id: 'b', display_name: 'ANA' },
      { id: 'a', display_name: 'ana' },
      { id: 'c', display_name: ' Ana ' },
    ].sort(comparePeopleByName).map((person) => person.id)).toEqual(['a', 'b', 'c'])
  })

  it('preserves full-name ordering and exposes a reusable name comparator', () => {
    expect(compareNames('Juan Carlos Pérez', 'Juan Diego Vargas')).toBeLessThan(0)
    expect(compareNames('Monica Gonzalez', 'Sandra Milena Peña')).toBeLessThan(0)
    expect(compareNames('María', 'Maria')).toBe(0)
    expect(['Nora', 'Ñora', 'Oscar', 'Óscar'].sort(compareNames)).toEqual(['Nora', 'Ñora', 'Oscar', 'Óscar'])
  })

  it('produces globally sorted pagination slices rather than page-local sorting', () => {
    const people = ['Griselda', 'Andrea', 'Sandra', 'Carlos', 'Monica', 'Abigail'].map((display_name, index) => ({ id: String(index), display_name }))
    const sorted = people.sort(comparePeopleByName)
    expect(sorted.slice(0, 3).map((person) => person.display_name)).toEqual(['Abigail', 'Andrea', 'Carlos'])
    expect(sorted.slice(3, 6).map((person) => person.display_name)).toEqual(['Griselda', 'Monica', 'Sandra'])
  })
})
