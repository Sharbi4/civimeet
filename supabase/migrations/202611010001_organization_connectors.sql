-- Organization connectors: how the organizer agent signs in to each platform.
-- Public rows hold status only. Encrypted logins, OAuth tokens, browser profiles and
-- OAuth state stay in the private schema and are reachable only through service-role RPCs.
begin;
create table public.organization_connectors (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connector text not null check (connector ~ '^[a-z][a-z0-9_]{1,39}$'),
  method text not null default 'browser' check (method in ('browser','credentials','oauth')),
  status text not null default 'not_connected' check (status in ('not_connected','awaiting_sign_in','verifying','saved','connected','needs_verification','needs_attention')),
  account_label text not null default '' check (length(account_label) <= 160),
  detail text not null default '' check (length(detail) <= 500),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  connected_by uuid references auth.users(id),
  connected_at timestamptz,
  last_checked_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (organization_id, connector)
);
create table public.connector_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  connector text not null,
  actor_id uuid references auth.users(id),
  action text not null check (action in ('browser_sign_in_started','browser_sign_in_finished','browser_sign_in_cancelled','credentials_saved','verified','verification_needed','verification_failed','oauth_started','oauth_connected','oauth_failed','settings_updated','disconnected')),
  message text not null default '' check (length(message) <= 300),
  created_at timestamptz not null default now(),
  foreign key (organization_id, connector) references public.organization_connectors(organization_id, connector) on delete cascade
);
create index connector_events_recent on public.connector_events(organization_id, created_at desc);

create table private.connector_secrets (
  organization_id uuid not null,
  connector text not null,
  ciphertext text not null check (length(ciphertext) between 20 and 20000),
  updated_at timestamptz not null default now(),
  primary key (organization_id, connector),
  foreign key (organization_id, connector) references public.organization_connectors(organization_id, connector) on delete cascade
);
create table private.connector_browser (
  organization_id uuid not null,
  connector text not null,
  profile_id uuid,
  provider_session uuid,
  human_actor uuid references auth.users(id),
  expires_at timestamptz,
  operation_until timestamptz,
  primary key (organization_id, connector),
  foreign key (organization_id, connector) references public.organization_connectors(organization_id, connector) on delete cascade
);
create table private.connector_oauth_states (
  state text primary key check (length(state) between 32 and 128),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connector text not null,
  actor_id uuid not null references auth.users(id) on delete cascade,
  code_verifier text not null check (length(code_verifier) between 43 and 128),
  redirect_uri text not null check (length(redirect_uri) <= 500),
  created_at timestamptz not null default now()
);

alter table public.organization_connectors enable row level security;
alter table public.connector_events enable row level security;
alter table private.connector_secrets enable row level security;
alter table private.connector_browser enable row level security;
alter table private.connector_oauth_states enable row level security;
create policy member_read on public.organization_connectors for select to authenticated using (private.is_member(organization_id));
create policy member_read on public.connector_events for select to authenticated using (private.is_member(organization_id));
revoke all on public.organization_connectors, public.connector_events from public, anon, authenticated;
revoke all on private.connector_secrets, private.connector_browser, private.connector_oauth_states from public, anon, authenticated;
grant select on public.organization_connectors, public.connector_events to authenticated;
grant all on public.organization_connectors, public.connector_events to service_role;
grant all on private.connector_secrets, private.connector_browser, private.connector_oauth_states to service_role;

create function private.require_connector_admin(actor uuid, workspace uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.organization_members where organization_id = workspace and user_id = actor and role in ('owner','admin')) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
end $$;

-- Reserve a connector for one server operation. Returns private runtime state to the server only.
create function public.claim_connector_operation(actor uuid, workspace uuid, target text, operation text, lease_seconds integer default 90) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare runtime private.connector_browser; secret_present boolean; item public.organization_connectors;
begin
  perform private.require_connector_admin(actor, workspace);
  if operation not in ('browser_start','browser_observe','browser_finish','browser_cancel','save_credentials','verify','disconnect','oauth_connect') then
    raise exception 'Unknown connector operation';
  end if;
  if lease_seconds not between 10 and 180 then raise exception 'Invalid lease'; end if;
  insert into public.organization_connectors(organization_id, connector) values (workspace, target) on conflict do nothing;
  insert into private.connector_browser(organization_id, connector) values (workspace, target) on conflict do nothing;
  select * into runtime from private.connector_browser where organization_id = workspace and connector = target for update;
  -- Observing a live sign-in never blocks on, or takes, the lease.
  if operation <> 'browser_observe' then
    if runtime.operation_until > now() then raise exception 'Connector is busy. Try again in a moment.'; end if;
    if operation in ('browser_start','verify') and (select count(*) from public.connector_events where organization_id = workspace and action in ('browser_sign_in_started','credentials_saved','verified','verification_needed','verification_failed') and created_at > now() - interval '24 hours') >= 60 then
      raise exception 'Daily connection attempt allowance reached';
    end if;
    update private.connector_browser set operation_until = now() + make_interval(secs => lease_seconds) where organization_id = workspace and connector = target;
  end if;
  select exists(select 1 from private.connector_secrets where organization_id = workspace and connector = target) into secret_present;
  select * into item from public.organization_connectors where organization_id = workspace and connector = target;
  return jsonb_build_object(
    'status', item.status,
    'method', item.method,
    'connectedAt', item.connected_at,
    'profileId', runtime.profile_id,
    'providerSession', runtime.provider_session,
    'humanActor', runtime.human_actor,
    'expiresAt', runtime.expires_at,
    'hasSecret', secret_present
  );
end $$;

-- Persist the verified outcome of an operation and release the lease.
create function public.finish_connector_operation(workspace uuid, target text, actor uuid, result jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare next_status text := result->>'status'; previous public.organization_connectors;
begin
  select * into previous from public.organization_connectors where organization_id = workspace and connector = target for update;
  if not found then raise exception 'Unknown connector'; end if;
  update public.organization_connectors set
    status = coalesce(next_status, status),
    method = coalesce(result->>'method', method),
    account_label = coalesce(result->>'accountLabel', account_label),
    detail = coalesce(result->>'detail', ''),
    connected_by = case when next_status = 'connected' and previous.status <> 'connected' then actor when next_status = 'not_connected' then null else connected_by end,
    connected_at = case when next_status = 'connected' and previous.status <> 'connected' then now() when next_status = 'not_connected' then null else connected_at end,
    last_checked_at = case when result ? 'checked' then now() else last_checked_at end,
    updated_at = now()
  where organization_id = workspace and connector = target;
  update private.connector_browser set
    profile_id = case when result ? 'profileId' then nullif(result->>'profileId','')::uuid else profile_id end,
    provider_session = case when result ? 'providerSession' then nullif(result->>'providerSession','')::uuid else provider_session end,
    human_actor = case when result ? 'humanActor' then nullif(result->>'humanActor','')::uuid else human_actor end,
    expires_at = case when result ? 'expiresAt' then nullif(result->>'expiresAt','')::timestamptz else expires_at end,
    operation_until = case when coalesce((result->>'keepLease')::boolean, false) then operation_until else null end
  where organization_id = workspace and connector = target;
  if result ? 'event' then
    insert into public.connector_events(organization_id, connector, actor_id, action, message)
    values (workspace, target, actor, result->>'event', left(coalesce(result->>'message',''), 300));
  end if;
end $$;

create function public.store_connector_secret(workspace uuid, target text, sealed text) returns void
language sql security definer set search_path = '' as $$
  insert into private.connector_secrets(organization_id, connector, ciphertext) values (workspace, target, sealed)
  on conflict (organization_id, connector) do update set ciphertext = excluded.ciphertext, updated_at = now();
$$;
create function public.read_connector_secret(workspace uuid, target text) returns text
language sql stable security definer set search_path = '' as $$
  select ciphertext from private.connector_secrets where organization_id = workspace and connector = target;
$$;
-- Forget everything the agent holds for this connector; returns the browser profile to delete.
create function public.forget_connector(workspace uuid, target text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare old_profile uuid;
begin
  select profile_id into old_profile from private.connector_browser where organization_id = workspace and connector = target;
  delete from private.connector_secrets where organization_id = workspace and connector = target;
  update private.connector_browser set profile_id = null, provider_session = null, human_actor = null, expires_at = null where organization_id = workspace and connector = target;
  return old_profile;
end $$;

create function public.begin_connector_oauth(actor uuid, workspace uuid, target text, oauth_state text, verifier text, callback text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_connector_admin(actor, workspace);
  delete from private.connector_oauth_states where created_at < now() - interval '15 minutes';
  insert into public.organization_connectors(organization_id, connector) values (workspace, target) on conflict do nothing;
  insert into private.connector_oauth_states(state, organization_id, connector, actor_id, code_verifier, redirect_uri)
  values (oauth_state, workspace, target, actor, verifier, callback);
end $$;
-- One-time use: the state row is deleted when taken and rejected after ten minutes.
create function public.take_connector_oauth(oauth_state text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare item private.connector_oauth_states;
begin
  delete from private.connector_oauth_states where state = oauth_state returning * into item;
  if not found or item.created_at < now() - interval '10 minutes' then raise exception 'Sign-in link expired. Start again.'; end if;
  perform private.require_connector_admin(item.actor_id, item.organization_id);
  return jsonb_build_object('organizationId', item.organization_id, 'connector', item.connector, 'actor', item.actor_id, 'verifier', item.code_verifier, 'redirectUri', item.redirect_uri);
end $$;

-- Administrators adjust community-safety settings directly. Autopilot commenting unlocks
-- only after an account has been connected for fourteen days.
create function public.save_connector_settings(workspace uuid, target text, next_settings jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare item public.organization_connectors; mode text := coalesce(next_settings->>'comment_mode', 'approve_each'); limit_value integer; pause_value boolean;
begin
  if not private.is_admin(workspace) then raise exception 'Administrator access required' using errcode = '42501'; end if;
  if jsonb_typeof(next_settings) <> 'object' or exists(select 1 from jsonb_object_keys(next_settings) k where k not in ('comment_mode','daily_comment_limit','auto_pause')) then
    raise exception 'Unsupported connector setting';
  end if;
  if mode not in ('approve_each','autopilot') then raise exception 'Unknown comment mode'; end if;
  limit_value := coalesce((next_settings->>'daily_comment_limit')::integer, 10);
  if limit_value not between 1 and 15 then raise exception 'Daily comment limit must be between 1 and 15'; end if;
  pause_value := coalesce((next_settings->>'auto_pause')::boolean, true);
  select * into item from public.organization_connectors where organization_id = workspace and connector = target for update;
  if not found or item.status <> 'connected' then raise exception 'Connect this account before changing its settings'; end if;
  if mode = 'autopilot' and (item.connected_at is null or item.connected_at > now() - interval '14 days') then
    raise exception 'Autopilot unlocks after 14 days of approved activity';
  end if;
  update public.organization_connectors set settings = jsonb_build_object('comment_mode', mode, 'daily_comment_limit', limit_value, 'auto_pause', pause_value), updated_at = now()
  where organization_id = workspace and connector = target;
  insert into public.connector_events(organization_id, connector, actor_id, action, message)
  values (workspace, target, auth.uid(), 'settings_updated', format('Comments: %s, up to %s a day', replace(mode, '_', ' '), limit_value));
  return jsonb_build_object('comment_mode', mode, 'daily_comment_limit', limit_value, 'auto_pause', pause_value);
end $$;

revoke all on function public.claim_connector_operation(uuid,uuid,text,text,integer), public.finish_connector_operation(uuid,text,uuid,jsonb),
  public.store_connector_secret(uuid,text,text), public.read_connector_secret(uuid,text), public.forget_connector(uuid,text),
  public.begin_connector_oauth(uuid,uuid,text,text,text,text), public.take_connector_oauth(text), private.require_connector_admin(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.claim_connector_operation(uuid,uuid,text,text,integer), public.finish_connector_operation(uuid,text,uuid,jsonb),
  public.store_connector_secret(uuid,text,text), public.read_connector_secret(uuid,text), public.forget_connector(uuid,text),
  public.begin_connector_oauth(uuid,uuid,text,text,text,text), public.take_connector_oauth(text), private.require_connector_admin(uuid,uuid)
  to service_role;
revoke all on function public.save_connector_settings(uuid,text,jsonb) from public, anon;
grant execute on function public.save_connector_settings(uuid,text,jsonb) to authenticated;

-- Live status in the workspace. Realtime still applies the member_read policies above.
do $$ begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.organization_connectors, public.connector_events;
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
