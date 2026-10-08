import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261008160000_harden_core_operations.sql'), 'utf8')
const worker = readFileSync(resolve(process.cwd(), 'worker/outbox-worker.ts'), 'utf8')
const campaignApi = readFileSync(resolve(process.cwd(), 'app/api/campaigns/[id]/route.ts'), 'utf8')
const campaignCreateApi = readFileSync(resolve(process.cwd(), 'app/api/campaigns/route.ts'), 'utf8')

describe('core operations release contract', () => {
  it('requires explicit campaign start and gates claims by lifecycle', () => {
    expect(migration).toContain('create or replace function public.queue_campaign(p_campaign_id uuid)')
    expect(migration).toContain("where id = p_campaign_id and owner_id = v_owner_id and status = 'READY'")
    expect(migration).toContain("c.status in ('QUEUED', 'RUNNING')")
    expect(migration).not.toContain("c.status not in ('CANCELLED','PAUSED')")
    expect(campaignCreateApi).not.toContain("update({ status: 'QUEUED' })")
    expect(campaignApi).toContain("'queue_campaign'")
  })

  it('uses domain RPCs for pause, resume and cancel', () => {
    expect(migration).toContain('create or replace function public.pause_campaign(p_campaign_id uuid)')
    expect(migration).toContain('create or replace function public.resume_campaign(p_campaign_id uuid)')
    expect(campaignApi).toContain("'pause_campaign'")
    expect(campaignApi).toContain("'resume_campaign'")
    expect(campaignApi).toContain("'cancel_campaign'")
    expect(migration).toContain("status in ('QUEUED', 'RUNNING')")
    expect(migration).toContain("status = 'PAUSED'")
  })

  it('starts campaigns on first claim and reconciles terminal state', () => {
    expect(migration).toContain("set status = 'RUNNING'")
    expect(migration).toContain('create or replace function public.refresh_campaign_status(p_campaign_id uuid)')
    expect(migration).toContain("v_next := 'FAILED'")
    expect(migration).toContain("v_next := 'COMPLETED'")
    expect(worker).toContain("rpc('refresh_campaign_status'")
    expect(worker).toContain("'OUTCOME_UNKNOWN'")
  })

  it('keeps server-only writes and covers foreign keys', () => {
    for (const index of ['campaign_recipients_campaign_owner_idx', 'campaign_recipients_contact_owner_idx', 'campaign_recipients_owner_idx', 'messages_campaign_owner_idx', 'messages_contact_owner_idx', 'messages_recipient_owner_idx']) expect(migration).toContain(index)
    expect(migration).toContain('revoke insert, update, delete on table public.messages from anon, authenticated')
    expect(migration).toContain('revoke update, delete on table public.campaigns from anon, authenticated')
    expect(migration).toContain('revoke all on table public.webhook_events from anon, authenticated')
    expect(migration).toContain('revoke all on function public.claim_outbox_batch(integer) from public, anon, authenticated')
    expect(migration).toContain('grant execute on function public.claim_outbox_batch(integer) to service_role')
  })
})
