import { requireUser } from '@/lib/supabase/user'
import { ContactDetail } from './contact-detail'

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) { await requireUser(); const { id } = await params; return <ContactDetail contactId={id} /> }
