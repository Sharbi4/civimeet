begin;
-- Explicit defense in depth independent of the deployment's default privileges.
revoke all on private.agent_credentials from public,anon,authenticated;
alter table private.agent_credentials enable row level security;
commit;
