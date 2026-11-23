import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261123120000_campaign_controls_and_editing.sql'), 'utf8')
const worker = readFileSync(resolve(process.cwd(), 'worker/outbox-worker.ts'), 'utf8')

describe('campaign control contracts', () => {
  it('requires effective pause semantics and prevents claims after a pause request', () => {
    expect(migration).toContain('pause_requested boolean not null default false')
    expect(migration).toContain("status = case when v_active = 0 then 'PAUSED' else status end")
    expect(migration).toContain('not c.pause_requested')
    expect(migration).toContain("status = 'CANCELLED'")
  })

  it('serializes claim release with cancellation using a service-role RPC', () => {
    const release = migration.slice(migration.indexOf('create or replace function public.release_claimed_message'))
    expect(release).toContain('create or replace function public.release_claimed_message(p_message_id uuid)')
    expect(release).toContain("set status = 'CANCELLED', claimed_at = null")
    expect(release).toContain("set status = 'QUEUED', claimed_at = null")
    expect(release).toContain('revoke all on function public.release_claimed_message(uuid) from public, anon, authenticated')
    expect(release).toContain('grant execute on function public.release_claimed_message(uuid) to service_role')
    expect(release.indexOf('select status, pause_requested')).toBeLessThan(release.indexOf('select status into v_message_status'))
  })

  it('revalidates campaign and provider state after claiming', () => {
    expect(worker).toContain("campaign.status === 'PAUSED'")
    expect(worker).toContain("await adapter.getConnectionState() !== 'CONNECTED'")
    expect(worker).toContain("supabase.rpc('release_claimed_message'")
    expect(worker).not.toContain("status: 'QUEUED', claimed_at: null")
  })
})
