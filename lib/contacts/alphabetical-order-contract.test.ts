import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync('supabase/migrations/20261015120000_alphabetical_people_order.sql', 'utf8')
const detailApi = readFileSync('app/api/campaigns/[id]/route.ts', 'utf8')
const preflight = migration.slice(migration.indexOf('create or replace function public.preflight_campaign_audience'), migration.indexOf('create or replace function public.get_contact_import_review'))

describe('alphabetical people order migration contract', () => {
  it('replaces all four paginated SQL ordering paths without changing signatures', () => {
    expect(migration.match(/create or replace function public\.get_contacts_workspace/g)).toHaveLength(1)
    expect(migration.match(/create or replace function public\.resolve_contact_ids_for_selection/g)).toHaveLength(1)
    expect(migration.match(/create or replace function public\.preflight_campaign_audience/g)).toHaveLength(1)
    expect(migration.match(/create or replace function public\.get_contact_import_review/g)).toHaveLength(1)
    expect(migration).toContain("order by translate(lower(btrim(coalesce(c.display_name, ''))), 'áàäâéèëêíìïîóòöôúùüû', 'aaaaeeeeiiiioooouuuu') collate \"es-x-icu\" asc, c.id asc")
    expect(migration).toContain("translate(lower(btrim(coalesce(nullif(normalized_name, ''), nullif(raw_name, ''), ''))), 'áàäâéèëêíìïîóòöôúùüû', 'aaaaeeeeiiiioooouuuu') collate \"es-x-icu\" as sort_key")
    expect(migration).toContain('order by sort_key, row_number, id')
    expect(migration).toContain('to_jsonb(r) - \'sort_key\' order by r.sort_key, r.row_number, r.id')
  })

  it('preserves owner scope, security mode, grants, and does not alter source names', () => {
    expect(migration.match(/security invoker/g)?.length).toBeGreaterThanOrEqual(4)
    expect(migration).toContain('select auth.uid()')
    expect(migration).toContain('grant execute on function public.get_contacts_workspace')
    expect(migration).toContain('grant execute on function public.resolve_contact_ids_for_selection')
    expect(migration).toContain('grant execute on function public.preflight_campaign_audience')
    expect(migration).toContain('grant execute on function public.get_contact_import_review')
    expect(migration).toContain('row_number')
    expect(migration).not.toContain('update public.contact_import_rows')
    expect(migration).not.toContain('alter table')
  })

  it('keeps preflight free of permission and frequency gating', () => {
    expect(preflight).not.toContain('recently_contacted')
    expect(preflight).not.toContain('make_interval(days')
    expect(preflight).not.toContain('INVALID_FREQUENCY_CAP')
    expect(preflight).not.toContain("'recent'")
    expect(preflight).not.toContain('contact_channel_permissions')
    expect(migration).toContain('p_frequency_cap_days integer')
    expect(preflight).toContain("'eligible', (select count(*) from eligible)")
  })

  it('uses lower-before-translate with Spanish ICU collation and preserves ñ', () => {
    expect(migration).not.toContain("'áàäâéèëêíìïîóòöôúùüûñ'")
    expect(migration).toContain("'áàäâéèëêíìïîóòöôúùüû'")
    expect(migration).toContain("'aaaaeeeeiiiioooouuuu'")
    expect(migration.match(/collate \"es-x-icu\"/g)).toHaveLength(4)
    expect(migration).toContain('translate(lower(')
  })

  it('sorts campaign recipients after snapshot identity reconstruction', () => {
    expect(detailApi).toContain('first_name_snapshot, display_name_snapshot, phone_snapshot')
    expect(detailApi).toContain('safeRecipients.sort')
    expect(detailApi).toContain('comparePeopleByName')
    expect(detailApi).not.toContain('order by created_at')
  })
})
