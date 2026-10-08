import { requireUser } from '@/lib/supabase/user'
import { ReviewWorkspace } from './review-workspace'

export default async function ImportReviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser()
  const { id } = await params
  return <ReviewWorkspace importId={id} />
}
