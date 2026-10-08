import Link from 'next/link'
import { requireUser } from '@/lib/supabase/user'
import { CampaignList } from './campaign-list'
export default async function CampaignsPage() { await requireUser(); return <div className="stack"><div className="row" style={{ justifyContent: 'space-between' }}><div><h1>Campañas</h1><p>Audiencias congeladas y mensajes en outbox.</p></div><Link className="button-link" href="/app/campaigns/new">Nueva campaña</Link></div><CampaignList /></div> }
