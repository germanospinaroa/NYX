import { requireUser } from '@/lib/supabase/user'
import { LabelsWorkspace } from './labels-workspace'
export default async function LabelsPage() { await requireUser(); return <div className="stack"><div className="page-heading"><div><span className="eyebrow">ORGANIZACIÓN</span><h1>Etiquetas</h1><p>Una biblioteca ligera para darle contexto a tu red.</p></div></div><LabelsWorkspace /></div> }
