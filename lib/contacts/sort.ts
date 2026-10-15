const PEOPLE_NAME_COLLATOR = new Intl.Collator('es', {
  sensitivity: 'base',
  usage: 'sort',
  numeric: true,
})

export function compareNames(left: string | null | undefined, right: string | null | undefined): number {
  return PEOPLE_NAME_COLLATOR.compare(left?.trim() ?? '', right?.trim() ?? '')
}

export function comparePeopleByName<T extends { display_name?: string | null; id: string }>(left: T, right: T): number {
  const byName = compareNames(left.display_name, right.display_name)
  return byName || left.id.localeCompare(right.id)
}
