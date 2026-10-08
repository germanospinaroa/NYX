import { requireUser } from '@/lib/supabase/user'
import Link from 'next/link'
import { ContactsWorkspace } from './contacts-workspace'

export default async function ContactsPage() {
  const { user } = await requireUser()
  return <div className="stack"><div className="row" style={{ justifyContent: 'space-between' }}><div><h1>Contactos</h1><p>Tu red viva: contexto, labels y próximas conversaciones.</p></div><div className="row"><Link href="/app/contacts/new" className="button-link">+ Nuevo contacto</Link><Link href="/app/imports/new" className="button-link secondary-link">Importar agenda</Link></div></div><ContactsWorkspace /><small style={{ color: 'var(--muted)' }}>Sesión: {user.email ?? 'owner autenticado'}</small></div>
}
