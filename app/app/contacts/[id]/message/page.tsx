import { requireUser } from '@/lib/supabase/user'
import Link from 'next/link'
import { Icon } from '../../../ui'
import { notFound } from 'next/navigation'
import { MessageComposer } from './message-composer'
export default async function MessagePage({ params }: { params: Promise<{ id: string }> }) { const { supabase, user } = await requireUser(); const { id } = await params; const { data } = await supabase.from('contacts').select('id, display_name, phone_e164, notes').eq('id', id).eq('owner_id', user.id).maybeSingle(); if (!data) notFound(); return <div className="stack message-page"><div className="message-page-header"><Link className="back-link" href={'/app/contacts/' + id}><Icon name="arrow-left" size={16} />Contacto</Link><span className="eyebrow">CONVERSACIÓN</span><h1>Enviar mensaje</h1><p>Compón una secuencia clara antes de iniciar la conversación.</p></div><MessageComposer contact={{ id: data.id, displayName: data.display_name, phone: data.phone_e164, notes: data.notes }} /></div> }
