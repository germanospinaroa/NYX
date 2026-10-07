import Link from 'next/link'
import { requireUser } from '@/lib/supabase/user'

function escapeLike(value: string) { return value.replace(/[\\%_]/gu, (char) => `\\${char}`) }

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { supabase, user } = await requireUser()
  const query = (await searchParams).q?.trim() ?? ''
  const base = () => supabase.from('contacts').select('id, display_name, first_name, phone_e164, created_at').order('created_at', { ascending: false }).limit(500)
  const results = query
    ? await Promise.all([base().ilike('display_name', `%${escapeLike(query)}%`), base().ilike('phone_e164', `%${escapeLike(query)}%`)] )
    : [await base()]
  if (results.some((result) => result.error)) throw new Error('CONTACTS_LOAD_FAILED')
  const contacts = Array.from(new Map(results.flatMap((result) => result.data ?? []).map((contact) => [contact.id, contact])).values())
  return <div className="stack">
    <div className="row" style={{ justifyContent: 'space-between' }}><div><h1>Contactos</h1><p>{contacts.length} contactos visibles para tu cuenta.</p></div><Link href="/app/imports/new"><button>Importar agenda</button></Link></div>
    <form className="row" method="get"><input name="q" placeholder="Buscar por nombre o teléfono" defaultValue={query} /><button className="secondary">Buscar</button></form>
    <div className="card" style={{ padding: 0, overflow: 'auto' }}><table><thead><tr><th>Nombre</th><th>Nombre corto</th><th>Teléfono</th></tr></thead><tbody>{contacts.map((contact) => <tr key={contact.id}><td>{contact.display_name}</td><td>{contact.first_name}</td><td>{contact.phone_e164}</td></tr>)}{contacts.length === 0 && <tr><td colSpan={3}>No hay contactos.</td></tr>}</tbody></table></div>
    <small style={{ color: 'var(--muted)' }}>Sesión: {user.email ?? 'owner autenticado'}</small>
  </div>
}
