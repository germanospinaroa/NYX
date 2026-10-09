import type { SupabaseClient } from '@supabase/supabase-js'

export type ContactSelection =
  | { mode: 'ids'; ids: Set<string> }
  | { mode: 'filter'; q: string; gender: string; labelId: string; archived?: string; permission?: string; excludeIds: Set<string>; total?: number }

export type SerializedContactSelection =
  | { mode: 'ids'; contactIds: string[] }
  | { mode: 'filter'; q?: string; gender?: string; labelId?: string; archived?: string; permission?: string; excludeIds?: string[] }

export function selectionCount(selection: ContactSelection | null, filteredTotal: number): number {
  if (!selection) return 0
  if (selection.mode === 'ids') return selection.ids.size
  return Math.max(filteredTotal - selection.excludeIds.size, 0)
}

export function selectionIncludes(selection: ContactSelection | null, contactId: string): boolean {
  if (!selection) return false
  if (selection.mode === 'ids') return selection.ids.has(contactId)
  return !selection.excludeIds.has(contactId)
}

export async function resolveContactIds(
  supabase: SupabaseClient,
  ownerId: string,
  selection: SerializedContactSelection,
): Promise<{ ids: string[]; error: unknown | null }> {
  if (selection.mode === 'ids') return { ids: selection.contactIds, error: null }

  const escapedQuery = (selection.q ?? '').replace(/[\\%_,().]/gu, (char) => `\\${char}`)
  const { data, error } = await supabase.rpc('resolve_contact_ids_for_selection', {
    p_q: escapedQuery,
    p_gender: selection.gender || null,
    p_label_id: selection.labelId || null,
    p_archived: selection.archived || 'ACTIVE',
    p_permission: selection.permission || null,
    p_exclude_ids: selection.excludeIds ? [...selection.excludeIds] : [],
  })
  return { ids: ((data ?? []) as Array<string | { resolve_contact_ids_for_selection: string }>).map((row) => typeof row === 'string' ? row : row.resolve_contact_ids_for_selection), error }
}
