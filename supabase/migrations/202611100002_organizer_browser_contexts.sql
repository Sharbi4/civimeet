-- Each organization's saved Browserbase profile (cookies), so a person signs in to a site once
-- in Civi's browser instead of every conversation. Only the profile ID is stored here; the
-- profile itself stays encrypted at Browserbase. Service-role access only.
begin;
create table private.organizer_browser_contexts (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  context_id text not null check (length(context_id) between 1 and 200),
  created_at timestamptz not null default now()
);
alter table private.organizer_browser_contexts enable row level security;
revoke all on private.organizer_browser_contexts from public, anon, authenticated;
grant all on private.organizer_browser_contexts to service_role;
create function public.get_organizer_browser_context(workspace uuid) returns text
language sql stable security definer set search_path = '' as $$
  select context_id from private.organizer_browser_contexts where organization_id = workspace;
$$;
create function public.save_organizer_browser_context(workspace uuid, context text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.organizer_browser_contexts(organization_id, context_id) values (workspace, context)
  on conflict (organization_id) do update set context_id = excluded.context_id, created_at = now();
end $$;
revoke all on function public.get_organizer_browser_context(uuid), public.save_organizer_browser_context(uuid,text) from public, anon, authenticated;
grant execute on function public.get_organizer_browser_context(uuid), public.save_organizer_browser_context(uuid,text) to service_role;
notify pgrst, 'reload schema';
commit;
