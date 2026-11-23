import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261123120000_campaign_controls_and_editing.sql'), 'utf8')
const heartbeatMigration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261124000000_worker_heartbeats.sql'), 'utf8')
const creation = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261010120000_campaign_content_variants_v1.sql'), 'utf8')
const worker = readFileSync(resolve(process.cwd(), 'worker/outbox-worker.ts'), 'utf8')
const ui = readFileSync(resolve(process.cwd(), 'app/app/ui.tsx'), 'utf8')
const list = readFileSync(resolve(process.cwd(), 'app/app/campaigns/campaign-list.tsx'), 'utf8')
const detail = readFileSync(resolve(process.cwd(), 'app/app/campaigns/[id]/campaign-detail.tsx'), 'utf8')

const fixtures = [
  { id: 'no-permission-male', gender: 'MALE', archived: false, permission: null },
  { id: 'opted-in-female', gender: 'FEMALE', archived: false, permission: 'OPTED_IN' },
  { id: 'opted-out-unknown', gender: 'UNKNOWN', archived: false, permission: 'OPTED_OUT' },
  { id: 'no-permission-female', gender: 'FEMALE', archived: false, permission: null },
  { id: 'archived-male', gender: 'MALE', archived: true, permission: null },
] as const

function eligibilitySql(source: string) {
  const start = source.indexOf('with eligible as (')
  const end = source.indexOf('get diagnostics v_recipient_count', start)
  return source.slice(start, end).replaceAll('v_campaign_id', 'p_campaign_id').replace(/\s+/gu, ' ').trim()
}

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

  it('keeps READY editing identical to creation eligibility and snapshots', () => {
    const editBody = migration.slice(migration.indexOf('create or replace function public.update_campaign_with_variants'))
    expect(editBody).not.toContain('contact_channel_permissions')
    expect(editBody).not.toContain('OPTED_IN')
    expect(eligibilitySql(editBody)).toBe(eligibilitySql(creation))
    expect(editBody).toContain('permission_status_snapshot,\n    frequency_limited, resolved_message_variant')
    expect(editBody).toContain('eligible.first_name, eligible.display_name, null, false')
    expect(editBody).toContain('(nullif(s.male_text, \'\') is not null or nullif(s.male_caption, \'\') is not null)')
    expect(editBody).toContain('(nullif(s.female_text, \'\') is not null or nullif(s.female_caption, \'\') is not null)')

    const selected = fixtures.map((fixture) => fixture.id)
    const eligible = fixtures.filter((fixture) => selected.includes(fixture.id) && !fixture.archived).map((fixture) => fixture.id)
    expect(eligible).toEqual(['no-permission-male', 'opted-in-female', 'opted-out-unknown', 'no-permission-female'])
    expect(eligible).toContain('no-permission-male')
    expect(eligible).toContain('opted-out-unknown')
  })

  it('preserves creation validation and SECURITY DEFINER hardening', () => {
    const editBody = migration.slice(migration.indexOf('create or replace function public.update_campaign_with_variants'))
    for (const token of [
      "length(v_step->>'neutralText') > 10000",
      "length(v_step->>'mediaPath') > 500",
      "raise exception 'INVALID_AUDIO_CONTENT'",
      "raise exception 'INVALID_AUDIO_MIME'",
      "raise exception 'INVALID_CAMPAIGN_CAPTION'",
      'public.resolve_campaign_template',
      'on conflict do nothing',
    ]) expect(editBody).toContain(token)
    for (const functionName of ['pause_campaign', 'resume_campaign', 'queue_campaign', 'claim_outbox_batch', 'release_claimed_message', 'cancel_campaign', 'refresh_campaign_status', 'update_campaign_with_variants']) {
      const functionStart = migration.indexOf(`create or replace function public.${functionName}`)
      const functionEnd = migration.indexOf('\n$$;', functionStart)
      expect(migration.slice(functionStart, functionEnd)).toContain('security definer set search_path = public, pg_temp')
    }
  })

  it('revalidates campaign and provider state after claiming', () => {
    expect(worker).toContain("campaign.status === 'PAUSED'")
    expect(worker).toContain("await adapter.getConnectionState() !== 'CONNECTED'")
    expect(worker).toContain("supabase.rpc('release_claimed_message'")
    expect(worker).not.toContain("status: 'QUEUED', claimed_at: null")
  })

  it('locks campaigns before messages in the claim path', () => {
    const claim = migration.slice(migration.indexOf('create or replace function public.claim_outbox_batch'))
    expect(claim).toContain('order by c.id')
    expect(claim).toContain('for update skip locked')
    expect(claim.indexOf('order by c.id')).toBeLessThan(claim.indexOf('with candidates as'))
    expect(claim.indexOf('with candidates as')).toBeLessThan(claim.indexOf('order by m.available_at'))
    expect(claim).toContain('m.campaign_id = any(v_campaign_ids)')
  })

  it('keeps worker heartbeat telemetry protected and service-owned', () => {
    expect(heartbeatMigration).toContain('create table if not exists public.worker_heartbeats')
    expect(heartbeatMigration).toContain('alter table public.worker_heartbeats enable row level security')
    expect(heartbeatMigration).toContain('grant select, insert, update on table public.worker_heartbeats to service_role')
    expect(heartbeatMigration).toContain('to authenticated')
  })

  it('renders global operational telemetry and blocks unsafe campaign actions', () => {
    expect(ui).toContain("fetch('/api/evolution/status'")
    expect(ui).toContain('Actualizado')
    expect(ui).toContain('Listo para procesar')
    expect(list).toContain('!operational.canProcess')
    expect(detail).toContain('!operational.canProcess')
    expect(detail).toContain('actionName === \'RESUME\' && !window.confirm')
    expect(detail).toContain('actionName === \'CANCEL\' && !window.confirm')
  })
})
