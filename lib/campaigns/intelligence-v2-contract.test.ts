import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const migration = readFileSync('supabase/migrations/20261009220000_campaign_intelligence_v2.sql', 'utf8')

describe('campaign intelligence v2 migration contract', () => {
  it('is forward-only and protects permission/frequency snapshots', () => {
    expect(migration).toContain("status in ('DRAFT','READY','SCHEDULED'")
    expect(migration).toContain('frequency_cap_days')
    expect(migration).toContain('contact_channel_permissions')
    expect(migration).toContain('first_name_snapshot')
    expect(migration).toContain('display_name_snapshot')
    expect(migration).toContain("permission.status = 'OPTED_IN'")
    expect(migration).toContain('make_interval(days => p_frequency_cap_days)')
    expect(migration).not.toContain('drop table')
  })
  it('keeps scheduled work behind available_at and explicit transitions', () => {
    expect(migration).toContain('create or replace function public.schedule_campaign')
    expect(migration).toContain("status in ('READY','SCHEDULED')")
    expect(migration).toContain("c.status in ('QUEUED','RUNNING','SCHEDULED')")
    expect(migration).toContain('m.available_at <= now()')
    expect(migration).toContain('grant execute on function public.schedule_campaign')
    expect(migration).toContain('revoke all on function public.create_campaign_with_snapshot(text,jsonb,uuid[]) from public, anon, authenticated')
    expect(migration).toContain('revoke all on function public.create_campaign_snapshot(uuid,uuid[]) from authenticated')
  })
})
