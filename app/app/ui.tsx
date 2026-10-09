'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export type IconName = 'users' | 'send' | 'tags' | 'upload' | 'log-out' | 'plus' | 'search' | 'chevron-right' | 'chevron-down' | 'arrow-left' | 'arrow-up' | 'arrow-down' | 'trash' | 'archive' | 'message' | 'more' | 'filter' | 'check' | 'clock' | 'alert' | 'pause' | 'play' | 'x'

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
    tags: <><path d="M20.59 13.41 11 3.83V3H4v7h.83l9.58 9.59a2 2 0 0 0 2.83 0l3.35-3.35a2 2 0 0 0 0-2.83Z" /><circle cx="7.5" cy="6.5" r="1" /></>,
    upload: <><path d="M12 3v12" /><path d="m7 8 5-5 5 5" /><path d="M5 21h14" /></>,
    'log-out': <><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /><path d="M21 19V5a2 2 0 0 0-2-2h-6" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    'chevron-right': <path d="m9 18 6-6-6-6" />,
    'chevron-down': <path d="m6 9 6 6 6-6" />,
    'arrow-left': <><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></>,
    'arrow-up': <><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></>,
    'arrow-down': <><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></>,
    trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6" /></>,
    archive: <><path d="M3 6h18" /><path d="M5 6v14h14V6" /><path d="M3 6l2-3h14l2 3M9 10h6" /></>,
    message: <><path d="M21 11.5a8 8 0 0 1-8.5 8 8.5 8.5 0 0 1-4-.9L3 20l1.4-4A8 8 0 1 1 21 11.5Z" /></>,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="19" cy="12" r="1" fill="currentColor" /></>,
    filter: <path d="M4 6h16M7 12h10M10 18h4" />,
    check: <path d="m5 12 4 4L19 6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    alert: <><path d="M10.3 3.8 2.2 18a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>,
    pause: <><path d="M8 5v14M16 5v14" /></>,
    play: <path d="m8 5 11 7-11 7Z" />,
    x: <><path d="m6 6 12 12M18 6 6 18" /></>,
  }
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

export function StatusBadge({ status, tone = 'neutral' }: { status: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent' }) {
  const icon = tone === 'success' ? 'check' : tone === 'danger' ? 'alert' : tone === 'warning' ? 'clock' : tone === 'accent' ? 'send' : 'check'
  return <span className={`status-badge status-${tone}`}><Icon name={icon} size={13} />{status}</span>
}

const nav = [
  { href: '/app/contacts', label: 'Contactos', icon: 'users' as const },
  { href: '/app/campaigns', label: 'Campañas', icon: 'send' as const },
  { href: '/app/labels', label: 'Etiquetas', icon: 'tags' as const },
  { href: '/app/imports/new', label: 'Importar', icon: 'upload' as const },
]

function NavLinks({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname()
  return <nav className={mobile ? 'mobile-nav-links' : 'sidebar-nav'} aria-label="Navegación principal">{nav.map((item) => {
    const active = pathname === item.href || pathname.startsWith(item.href + '/')
    return <Link href={item.href} className={active ? 'nav-link active' : 'nav-link'} key={item.href}><Icon name={item.icon} size={17} /><span>{item.label}</span></Link>
  })}</nav>
}

export function AppShell({ children, logout }: { children: React.ReactNode; logout: React.ReactNode }) {
  const pathname = usePathname()
  const pageTitle = pathname.startsWith('/app/campaigns') ? 'Campañas' : pathname.startsWith('/app/labels') ? 'Etiquetas' : pathname.startsWith('/app/imports') ? 'Importar' : 'Contactos'
  return <div className="app-shell"><aside className="sidebar"><Link className="brand" href="/app/contacts"><span className="brand-mark">N</span><span><strong>NYX</strong><small>Relationship Intelligence</small></span></Link><NavLinks /><div className="sidebar-footer"><div className="sidebar-rule" />{logout}</div></aside><div className="app-column"><header className="mobile-topbar"><Link className="brand brand-mobile" href="/app/contacts"><span className="brand-mark">N</span><strong>NYX</strong></Link><span className="mobile-page-title">{pageTitle}</span>{logout}</header><main className="app-main">{children}</main><div className="mobile-nav"><NavLinks mobile /></div></div></div>
}
