import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const migration = readFileSync('supabase/migrations/20261009215909_campaign_intelligence_v2.sql', 'utf8')
const permissionRemoval = readFileSync('supabase/migrations/20261009232541_remove_campaign_permission_gating.sql', 'utf8')
const preflight = readFileSync('app/api/campaigns/preflight/route.ts', 'utf8')
const contactsRoute = readFileSync('app/api/contacts/route.ts', 'utf8')

describe('campaign intelligence v2 migration contract', () => {
  it('keeps frequency protection while removing permission gating non-destructively', () => {
    expect(migration).toContain("status in ('DRAFT','READY','SCHEDULED'")
    expect(migration).toContain('frequency_cap_days')
    expect(migration).toContain('first_name_snapshot')
    expect(migration).toContain('display_name_snapshot')
    expect(permissionRemoval).toContain('make_interval(days => p_frequency_cap_days)')
    expect(permissionRemoval).not.toContain("permission.status = 'OPTED_IN'")
    expect(permissionRemoval).not.toContain('join public.contact_channel_permissions')
    expect(permissionRemoval).not.toContain('drop table')
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
  it('uses set-based RPCs for large audiences', () => {
    expect(migration).toContain('create or replace function public.preflight_campaign_audience')
    expect(migration).toContain('create or replace function public.resolve_contact_ids_for_selection')
    expect(preflight).toContain("rpc('preflight_campaign_audience'")
    expect(preflight).not.toContain(".in('contact_id', resolved.ids)")
    expect(contactsRoute).toContain("rpc('get_contacts_workspace'")
  })
})
