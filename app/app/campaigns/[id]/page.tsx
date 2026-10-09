import { requireUser } from '@/lib/supabase/user'
import { CampaignDetail } from './campaign-detail'

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser()
  const { id } = await params
  return <CampaignDetail campaignId={id} />
}
