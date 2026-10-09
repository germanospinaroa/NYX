import { requireUser } from '@/lib/supabase/user'
import Link from 'next/link'
import { ContactForm } from './contact-form'

export default async function NewContactPage() { await requireUser(); return <div className="stack"><Link className="back-link" href="/app/contacts">← Contactos</Link><div className="page-heading"><span className="eyebrow">TU RED</span><h1>Nuevo contacto</h1><p>Agrega contexto desde el primer momento.</p></div><ContactForm /></div> }
