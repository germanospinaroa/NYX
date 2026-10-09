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
  const relations = [selection.labelId ? 'contact_labels!inner(label_id)' : null, selection.permission && selection.permission !== 'UNKNOWN' ? 'contact_channel_permissions!inner(status, channel)' : selection.permission === 'UNKNOWN' ? 'contact_channel_permissions(status, channel)' : null].filter(Boolean)
  const columns = ['id', ...relations].join(', ')
  const excluded = new Set(selection.excludeIds ?? [])
  const ids: string[] = []
  const batchSize = 1000
  let offset = 0

  while (true) {
    let builder = supabase.from('contacts').select(columns).eq('owner_id', ownerId).order('created_at', { ascending: false }).order('id', { ascending: true })
    if (escapedQuery) builder = builder.or(`display_name.ilike.%${escapedQuery}%,phone_e164.ilike.%${escapedQuery}%`)
    if (selection.gender && ['MALE', 'FEMALE', 'UNKNOWN'].includes(selection.gender)) builder = builder.eq('gender', selection.gender)
    if (selection.labelId) builder = builder.eq('contact_labels.label_id', selection.labelId)
    if (selection.archived === 'ARCHIVED') builder = builder.not('archived_at', 'is', null)
    else if (selection.archived !== 'ALL') builder = builder.is('archived_at', null)
    if (selection.permission && ['OPTED_IN', 'OPTED_OUT', 'UNKNOWN'].includes(selection.permission)) {
      builder = builder.eq('contact_channel_permissions.channel', 'WHATSAPP')
      builder = selection.permission === 'UNKNOWN'
        ? builder.or('status.eq.UNKNOWN,status.is.null', { foreignTable: 'contact_channel_permissions' })
        : builder.eq('contact_channel_permissions.status', selection.permission)
    }
    const { data, error } = await builder.range(offset, offset + batchSize - 1)
    if (error) return { ids: [], error }
    const rows = (data ?? []) as unknown as Array<{ id: string }>
    ids.push(...rows.map((row) => row.id).filter((id) => !excluded.has(id)))
    if (rows.length < batchSize) break
    offset += batchSize
  }

  return { ids, error: null }
}
