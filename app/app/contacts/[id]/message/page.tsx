import { requireUser } from '@/lib/supabase/user'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MessageComposer } from './message-composer'
export default async function MessagePage({ params }: { params: Promise<{ id: string }> }) { const { supabase, user } = await requireUser(); const { id } = await params; const { data } = await supabase.from('contacts').select('id, display_name, phone_e164, notes').eq('id', id).eq('owner_id', user.id).maybeSingle(); if (!data) notFound(); return <div className="stack"><Link href={'/app/contacts/' + id}>← Contacto</Link><div><h1>Enviar mensaje</h1><p>Construye una secuencia y revisa el orden antes de enviarla.</p></div><MessageComposer contact={{ id: data.id, displayName: data.display_name, phone: data.phone_e164, notes: data.notes }} /></div> }
