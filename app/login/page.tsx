import { LoginForm } from './login-form'

export default function LoginPage() {
  return <main className="login-shell"><div className="login-rail"><div className="login-brand-mark">N</div><div className="login-brand">NYX</div><p>Relationship<br />Intelligence</p></div><div className="login-panel"><div className="login-panel-inner"><span className="eyebrow">ESPACIO PRIVADO</span><h1>Tu red, con contexto.</h1><p className="login-intro">Organiza las relaciones que importan y vuelve a cada conversación con claridad.</p><LoginForm /></div></div></main>
}
