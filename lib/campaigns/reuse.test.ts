import { describe, expect, it } from 'vitest'
import { reconstructCampaignTemplate } from './reuse'

describe('campaign reuse template reconstruction', () => {
  it('deduplicates audience IDs and reconstructs ordered A/B variants', () => {
    const result = reconstructCampaignTemplate({
      recipients: [{ contact_id: 'one' }, { contact_id: 'one' }, { contact_id: 'two' }],
      steps: [
        { content_variant_key: null, sequence_index: 1, message_type: 'IMAGE', media_path: 'owner/image', neutral_caption: 'Imagen', male_caption: 'Él', female_caption: 'Ella', media_mime_type: null, media_duration_ms: null, neutral_text: null, male_text: null, female_text: null },
        { content_variant_key: 'B', sequence_index: 0, message_type: 'TEXT', media_path: null, neutral_caption: null, male_caption: null, female_caption: null, media_mime_type: null, media_duration_ms: null, neutral_text: 'B {{nombre}}', male_text: 'B hombre', female_text: null },
        { content_variant_key: 'A', sequence_index: 0, message_type: 'TEXT', media_path: null, neutral_caption: null, male_caption: null, female_caption: null, media_mime_type: null, media_duration_ms: null, neutral_text: 'A {{nombre}}', male_text: null, female_text: null },
      ],
    })
    expect(result.contactIds).toEqual(['one', 'two'])
    expect(result.variants.map((variant) => variant.key)).toEqual(['A', 'B'])
    expect(result.variants[0].steps[0].neutralText).toBe('A {{nombre}}')
    expect(result.variants[1].steps[0].maleText).toBe('B hombre')
    expect(result.variants[1].steps).toHaveLength(1)
  })

  it('preserves media metadata and never reads resolved messages', () => {
    const result = reconstructCampaignTemplate({
      recipients: [{ contact_id: 'one' }],
      steps: [{ content_variant_key: 'A', sequence_index: 0, message_type: 'AUDIO', media_path: 'owner/audio.webm', media_mime_type: 'audio/webm', media_duration_ms: 1200, neutral_text: 'resolved text must not exist', male_text: null, female_text: null, neutral_caption: null, male_caption: null, female_caption: null }],
    })
    expect(result.variants[0].steps[0]).toMatchObject({ type: 'AUDIO', mediaPath: 'owner/audio.webm', mimeType: 'audio/webm', durationMs: 1200 })
    expect(result.variants[0].steps[0]).not.toHaveProperty('neutralText', 'resolved text must not exist')
  })
})
