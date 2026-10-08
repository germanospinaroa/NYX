import { requireUser } from '@/lib/supabase/user'
import { ContactsWorkspace } from './contacts-workspace'

export default async function ContactsPage() {
  const { user } = await requireUser()
  return <div className="stack"><div className="row" style={{ justifyContent: 'space-between' }}><div><h1>Contactos</h1><p>Contactos persistentes de tu cuenta.</p></div><a href="/app/imports/new"><button>Importar agenda</button></a></div><ContactsWorkspace /><small style={{ color: 'var(--muted)' }}>Sesión: {user.email ?? 'owner autenticado'}</small></div>
}
