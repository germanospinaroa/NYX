import { requireUser } from '@/lib/supabase/user'
import { LabelsWorkspace } from './labels-workspace'
export default async function LabelsPage() { await requireUser(); return <div className="stack"><h1>Labels</h1><p>Una biblioteca para organizar tu red.</p><LabelsWorkspace /></div> }
