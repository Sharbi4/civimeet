-- Civi's live browser (Browserbase): one browser per organizer conversation. The CDP connect
-- URL can carry provider credentials, so it lives in the private schema and is reachable only
-- through these service-role functions. The live-view link is handed to authorized members by
-- the server; "human_control" pauses Civi's browser tools while a person has taken over.
begin;
create table private.organizer_browsers (
  organizer_session_id uuid primary key references public.organizer_sessions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider_session text not null check (length(provider_session) between 1 and 200),
  connect_url text not null check (length(connect_url) between 1 and 2000),
  live_url text not null check (length(live_url) between 1 and 2000),
  human_control boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
alter table private.organizer_browsers enable row level security;
revoke all on private.organizer_browsers from public, anon, authenticated;
grant all on private.organizer_browsers to service_role;

create function public.get_organizer_browser(conversation uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(b) from private.organizer_browsers b
  where b.organizer_session_id = conversation and b.expires_at > now();
$$;

create function public.save_organizer_browser(conversation uuid, workspace uuid, provider text, connect text, live text, expires timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.organizer_sessions where id = conversation and organization_id = workspace) then
    raise exception 'Unknown conversation';
  end if;
  insert into private.organizer_browsers(organizer_session_id, organization_id, provider_session, connect_url, live_url, expires_at)
  values (conversation, workspace, provider, connect, live, expires)
  on conflict (organizer_session_id) do update set provider_session = excluded.provider_session,
    connect_url = excluded.connect_url, live_url = excluded.live_url, human_control = false,
    created_at = now(), expires_at = excluded.expires_at;
end $$;

create function public.set_organizer_browser_control(conversation uuid, workspace uuid, human boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update private.organizer_browsers set human_control = human
  where organizer_session_id = conversation and organization_id = workspace and expires_at > now();
  return found;
end $$;

create function public.forget_organizer_browser(conversation uuid, workspace uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare provider text;
begin
  delete from private.organizer_browsers
  where organizer_session_id = conversation and organization_id = workspace
  returning provider_session into provider;
  return provider;
end $$;

revoke all on function public.get_organizer_browser(uuid), public.save_organizer_browser(uuid,uuid,text,text,text,timestamptz),
  public.set_organizer_browser_control(uuid,uuid,boolean), public.forget_organizer_browser(uuid,uuid) from public, anon, authenticated;
grant execute on function public.get_organizer_browser(uuid), public.save_organizer_browser(uuid,uuid,text,text,text,timestamptz),
  public.set_organizer_browser_control(uuid,uuid,boolean), public.forget_organizer_browser(uuid,uuid) to service_role;
notify pgrst, 'reload schema';
commit;
