'use client'

import { createClient } from '@/lib/supabase/browser'
import { useRouter } from 'next/navigation'

export function LogoutButton() {
  const router = useRouter()
  return <button className="secondary" onClick={async () => { await createClient().auth.signOut(); router.replace('/login') }}>Salir</button>
}
