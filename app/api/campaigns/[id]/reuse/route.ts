import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/lib/supabase/user'
import { reconstructCampaignTemplate } from '@/lib/campaigns/reuse'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, user } = await requireUser()
    const { id } = await params
    if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'CAMPAIGN_REUSE_FAILED' }, { status: 404 })
    const [{ data: campaign, error: campaignError }, { data: recipients, error: recipientError }, { data: steps, error: stepsError }] = await Promise.all([
      supabase.from('campaigns').select('id, name').eq('id', id).eq('owner_id', user.id).maybeSingle(),
      supabase.from('campaign_recipients').select('contact_id').eq('campaign_id', id).eq('owner_id', user.id),
      supabase.from('campaign_sequence_steps').select('content_variant_key, sequence_index, message_type, neutral_text, male_text, female_text, neutral_caption, male_caption, female_caption, media_path, media_mime_type, media_duration_ms').eq('campaign_id', id).eq('owner_id', user.id),
    ])
    if (campaignError || recipientError || stepsError || !campaign) return NextResponse.json({ error: 'CAMPAIGN_REUSE_FAILED' }, { status: 404 })
    const template = reconstructCampaignTemplate({ recipients: recipients ?? [], steps: steps ?? [] })
    if (!template.contactIds.length || !template.variants.length) return NextResponse.json({ error: 'CAMPAIGN_REUSE_FAILED' }, { status: 404 })
    return NextResponse.json({ sourceCampaignId: campaign.id, sourceName: campaign.name, name: campaign.name ? `${campaign.name} · copia` : 'Nueva campaña', selection: { mode: 'ids', contactIds: template.contactIds }, variants: template.variants })
  } catch (error) {
    const message = error instanceof Error && error.message === 'UNAUTHORIZED' ? error.message : 'CAMPAIGN_REUSE_FAILED'
    return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 404 })
  }
}
