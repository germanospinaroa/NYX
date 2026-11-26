-- NYX no uses contact_channel_permissions as campaign eligibility. The
-- snapshot is intentionally NULL for campaigns created with the current rules.
alter table public.campaign_recipients
  drop constraint if exists campaign_recipients_permission_snapshot_check;
