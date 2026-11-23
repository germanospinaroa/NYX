import Link from 'next/link'
import { requireUser } from '@/lib/supabase/user'
import { CampaignForm } from '../../new/campaign-form'

export default async function EditCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser()
  const { id } = await params
  return <div className="stack"><Link className="back-link" href={`/app/campaigns/${id}`}>← Monitor</Link><div className="page-heading"><span className="eyebrow">COMPOSICIÓN</span><h1>Editando campaña</h1><p>Corrige la audiencia o la secuencia y guarda sobre la misma campaña.</p></div><CampaignForm campaignId={id} /></div>
}
