import { requireUser } from '@/lib/supabase/user'
import Link from 'next/link'
import { ContactForm } from './contact-form'

export default async function NewContactPage() { await requireUser(); return <div className="stack"><Link href="/app/contacts">← Contactos</Link><h1>Nuevo contacto</h1><p>Agrega una persona a tu red viva.</p><ContactForm /></div> }
