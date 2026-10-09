import { requireUser } from '@/lib/supabase/user'
import Link from 'next/link'
import { CampaignForm } from './campaign-form'
export default async function NewCampaignPage() { await requireUser(); return <div className="stack"><Link className="back-link" href="/app/campaigns">← Campañas</Link><div className="page-heading"><span className="eyebrow">COMPOSICIÓN</span><h1>Nueva campaña</h1><p>Prepara una secuencia para una audiencia concreta.</p></div><CampaignForm /></div> }
