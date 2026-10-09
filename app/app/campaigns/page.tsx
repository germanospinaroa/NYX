import Link from 'next/link'
import { requireUser } from '@/lib/supabase/user'
import { CampaignList } from './campaign-list'
export default async function CampaignsPage() { await requireUser(); return <div className="stack"><div className="page-heading-row"><div><span className="eyebrow">ACTIVACIÓN</span><h1>Campañas</h1><p>Secuencias concretas para conversaciones intencionales.</p></div><Link className="button-link" href="/app/campaigns/new">+ Nueva campaña</Link></div><CampaignList /></div> }
