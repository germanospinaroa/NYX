'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError(null)
    const { error: authError } = await createClient().auth.signInWithPassword({ email, password })
    if (authError) setError('No fue posible iniciar sesión.')
    else router.replace('/app/contacts')
    setLoading(false)
  }
  return <form className="stack" onSubmit={submit}>
    <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
    <div className="field"><label htmlFor="password">Contraseña</label><input id="password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
    {error && <div className="error" role="alert">{error}</div>}
    <button className="login-submit" disabled={loading}>{loading ? 'Verificando…' : 'Entrar'}</button>
  </form>
}
