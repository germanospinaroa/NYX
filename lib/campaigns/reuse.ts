import { CONTENT_VARIANT_KEYS, type ContentVariantKey } from './variants'

export type ReuseRecipientRow = { contact_id: string }
export type ReuseStepRow = {
  content_variant_key?: string | null
  sequence_index: number
  message_type: string
  neutral_text?: string | null
  male_text?: string | null
  female_text?: string | null
  neutral_caption?: string | null
  male_caption?: string | null
  female_caption?: string | null
  media_path?: string | null
  media_mime_type?: string | null
  media_duration_ms?: number | null
}

export type ReuseStep = {
  type: 'TEXT' | 'IMAGE' | 'AUDIO'
  neutralText?: string
  maleText?: string
  femaleText?: string
  neutralCaption?: string
  maleCaption?: string
  femaleCaption?: string
  mediaPath?: string
  mimeType?: string
  durationMs?: number
}

export type ReuseVariant = { key: ContentVariantKey; steps: ReuseStep[] }

export function reconstructCampaignTemplate(input: { recipients: ReuseRecipientRow[]; steps: ReuseStepRow[] }): { contactIds: string[]; variants: ReuseVariant[] } {
  const contactIds = [...new Set(input.recipients.map((recipient) => recipient.contact_id))]
  const grouped = new Map<ContentVariantKey, ReuseStepRow[]>()
  for (const row of input.steps) {
    const key = CONTENT_VARIANT_KEYS.includes((row.content_variant_key ?? 'A') as ContentVariantKey) ? (row.content_variant_key ?? 'A') as ContentVariantKey : 'A'
    const rows = grouped.get(key) ?? []
    rows.push(row)
    grouped.set(key, rows)
  }
  const variants = CONTENT_VARIANT_KEYS.filter((key) => grouped.has(key)).map((key) => ({
    key,
    steps: (grouped.get(key) ?? []).sort((left, right) => left.sequence_index - right.sequence_index).map((row) => {
      const type: ReuseStep['type'] = row.message_type === 'IMAGE' || row.message_type === 'AUDIO' ? row.message_type : 'TEXT'
      if (type === 'TEXT') return { type, neutralText: row.neutral_text ?? '', maleText: row.male_text ?? '', femaleText: row.female_text ?? '' }
      if (type === 'IMAGE') return { type, mediaPath: row.media_path ?? '', neutralCaption: row.neutral_caption ?? '', maleCaption: row.male_caption ?? '', femaleCaption: row.female_caption ?? '' }
      return { type, mediaPath: row.media_path ?? '', mimeType: row.media_mime_type ?? undefined, durationMs: row.media_duration_ms ?? undefined }
    }),
  }))
  return { contactIds, variants }
}
