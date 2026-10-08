import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261008150000_core_operations.sql'), 'utf8')
const worker = readFileSync(resolve(process.cwd(), 'worker/outbox-worker.ts'), 'utf8')
const adapter = readFileSync(resolve(process.cwd(), 'worker/evolution-http-adapter.ts'), 'utf8')

describe('core operations contract', () => {
  it('keeps contact context and immutable campaign recipient snapshots', () => {
    expect(migration).toContain('add column if not exists notes text')
    expect(migration).toContain('add column if not exists archived_at timestamptz')
    expect(migration).toContain('create table if not exists public.campaign_recipients')
    expect(migration).toContain('gender_snapshot')
    expect(migration).toContain('phone_snapshot')
    expect(migration).toContain('unique (campaign_id, contact_id)')
    expect(migration).toContain('messages_recipient_owner_fk')
    expect(migration).toContain('enqueue_single_message')
    expect(migration).not.toContain('create policy "messages_insert_own"')
  })

  it('creates outbox rows set-based and claims concurrently', () => {
    expect(migration).toContain('insert into public.messages')
    expect(migration).toContain('for update skip locked')
    expect(migration).toContain('revoke all on function public.claim_outbox_batch(integer) from anon')
    expect(migration).toContain('revoke all on function public.claim_outbox_batch(integer) from authenticated')
    expect(worker).toContain("rpc('claim_outbox_batch'")
    expect(worker).not.toMatch(/for\s*\(.*contact/iu)
  })

  it('keeps Evolution server-side and preserves outcome_unknown', () => {
    expect(adapter).toContain("required('EVOLUTION_API_KEY')")
    expect(adapter).toContain('OutcomeUnknownError')
    expect(worker).toContain("'OUTCOME_UNKNOWN'")
    expect(worker).not.toContain('retry')
  })

  it('protects every new table with authenticated ownership policies', () => {
    for (const table of ['campaigns', 'campaign_recipients', 'messages', 'webhook_events']) expect(migration).toContain(`alter table public.${table} enable row level security`)
    expect(migration).toContain('security definer set search_path = public')
    expect(migration).toContain('grant execute on function public.create_campaign_snapshot(uuid, uuid[]) to authenticated')
    expect(migration).toContain('grant execute on function public.claim_outbox_batch(integer) to service_role')
    expect(migration).toContain('cancel_campaign')
    expect(migration).toContain("c.status not in ('CANCELLED','PAUSED')")
    expect(migration).toContain("v_status is distinct from 'DRAFT'")
    expect(migration).toContain("campaign_id = p_campaign_id and status = 'QUEUED'")
    expect(migration).toContain("m.status = 'SENDING'")
    expect(readFileSync(resolve(process.cwd(), 'app/api/messages/route.ts'), 'utf8')).toContain("rpc('enqueue_single_message'")
  })
})
