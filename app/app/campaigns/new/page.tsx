import { requireUser } from '@/lib/supabase/user'
import Link from 'next/link'
import { CampaignForm } from './campaign-form'
export default async function NewCampaignPage() { await requireUser(); return <div className="stack"><Link href="/app/campaigns">← Campañas</Link><h1>Nueva campaña</h1><p>Elige una audiencia concreta y prepara el mensaje. No se envía durante la creación.</p><CampaignForm /></div> }
