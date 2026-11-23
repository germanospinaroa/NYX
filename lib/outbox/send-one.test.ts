import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261124002000_direct_message_dispatch.sql'), 'utf8')
const command = readFileSync(resolve(process.cwd(), 'worker/send-one.ts'), 'utf8')

describe('individual direct-message dispatch', () => {
  it('claims exactly one queued direct message under a row lock', () => {
    expect(migration).toContain('p_message_id uuid')
    expect(migration).toContain("m.status = 'QUEUED'")
    expect(migration).toContain('for update of m')
    expect(migration).toContain("m.campaign_id is null")
    expect(migration).toContain("m.campaign_recipient_id is null")
    expect(migration).toContain('grant execute on function public.claim_direct_message(uuid) to service_role')
  })

  it('reuses the adapter and marks ambiguous outcomes without retrying', () => {
    expect(command).toContain('new EvolutionHttpAdapter()')
    expect(command).toContain('dispatchMessage(supabase, adapter, message)')
    expect(command).toContain("status: 'OUTCOME_UNKNOWN'")
    expect(command).not.toContain('claim_outbox_batch')
    expect(command).not.toContain('retry')
  })

  it('rejects campaign, already processed, and concurrent claims through the RPC contract', () => {
    expect(migration).toContain("m.provider_message_id is null")
    expect(migration).toContain("s.campaign_id is null")
    expect(migration).toContain("s.campaign_recipient_id is null")
    expect(command).toContain("'DIRECT_MESSAGE_NOT_ELIGIBLE'")
  })
})
