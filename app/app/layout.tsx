import Link from 'next/link'
import { LogoutButton } from './logout-button'

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <main><header><div><strong>NYX</strong><div className="nav"><Link href="/app/contacts">Contactos</Link><Link href="/app/imports/new">Importar</Link></div></div><LogoutButton /></header>{children}</main>
}
