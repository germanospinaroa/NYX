import { LogoutButton } from './logout-button'
import { AppShell } from './ui'

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AppShell logout={<LogoutButton />}>{children}</AppShell>
}
