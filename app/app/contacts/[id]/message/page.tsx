import { requireUser } from '@/lib/supabase/user'
import Link from 'next/link'
import { MessageComposer } from './message-composer'
export default async function MessagePage({ params }: { params: Promise<{ id: string }> }) { await requireUser(); const { id } = await params; return <div className="stack"><Link href={`/app/contacts/${id}`}>← Contacto</Link><h1>Enviar mensaje</h1><p>Se agregará al outbox. El worker lo enviará cuando esté configurado.</p><MessageComposer contactId={id} /></div> }
