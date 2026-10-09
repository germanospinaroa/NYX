import { requireUser } from '@/lib/supabase/user'
import Link from 'next/link'
import { ContactsWorkspace } from './contacts-workspace'

export default async function ContactsPage() {
  const { user } = await requireUser()
  return <div className="stack"><div className="page-heading-row"><div><span className="eyebrow">TU RED</span><h1>Contactos</h1><p>{user.email ? 'Personas, contexto y conversaciones que importan.' : 'Tu red organizada y accionable.'}</p></div><div className="row"><Link href="/app/contacts/new" className="button-link">+ Nuevo contacto</Link><Link href="/app/imports/new" className="button-link secondary-link">Importar agenda</Link></div></div><ContactsWorkspace /></div>
}
