import { resolveCampaignTemplate, type RecipientSnapshotName } from '@/lib/campaigns/personalization'
import type { MessageStep } from './sequence'

export function resolveIndividualMessageSteps(steps: MessageStep[], snapshot: RecipientSnapshotName): { steps: MessageStep[]; error?: 'VARIABLE_NO_COMPATIBLE' | 'MISSING_RECIPIENT_NAME' } {
  const resolved: MessageStep[] = []
  for (const step of steps) {
    if (step.type === 'AUDIO') {
      resolved.push(step)
      continue
    }
    const text = resolveCampaignTemplate(step.text ?? '', snapshot)
    if (text.error) return { steps, error: text.error }
    const caption = resolveCampaignTemplate(step.caption ?? '', snapshot)
    if (caption.error) return { steps, error: caption.error }
    resolved.push({ ...step, text: text.value, caption: caption.value })
  }
  return { steps: resolved }
}
