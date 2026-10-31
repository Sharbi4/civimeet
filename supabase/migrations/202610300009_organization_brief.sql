begin;
create table public.organization_briefs (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 coordinator text not null check(length(btrim(coordinator)) between 1 and 160),
 area text not null check(length(btrim(area)) between 1 and 200),
 mission text not null check(length(btrim(mission)) between 10 and 2000),
 voice text not null check(length(btrim(voice)) between 1 and 500),
 event_goal text not null default '' check(length(event_goal)<=1000),
 platform_actions jsonb not null default '{}' check(jsonb_typeof(platform_actions)='object'),
 updated_at timestamptz not null default now()
);
alter table public.organization_briefs enable row level security;
create policy member_read on public.organization_briefs for select to authenticated using(private.is_member(organization_id));
revoke all on public.organization_briefs from public,anon,authenticated;
grant select on public.organization_briefs to authenticated;
grant all on public.organization_briefs to service_role;
create function public.save_organization_brief(workspace uuid, brief jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare entry record; choices jsonb := brief->'platform_actions';
begin
 if not private.is_admin(workspace) then raise exception 'Organization administrator access required'; end if;
 if choices is null or jsonb_typeof(choices)<>'object' then raise exception 'Choose platform responsibilities'; end if;
 for entry in select key,value from jsonb_each_text(choices) loop
  if entry.key not in ('web','x','eventbrite','facebook','reddit','nextdoor','instagram') or length(btrim(entry.value)) not between 3 and 1000 then raise exception 'Invalid platform responsibility'; end if;
 end loop;
 if not choices ? 'web' then raise exception 'Public research is required'; end if;
 insert into public.organization_briefs(organization_id,coordinator,area,mission,voice,event_goal,platform_actions)
 values(workspace,btrim(brief->>'coordinator'),btrim(brief->>'area'),btrim(brief->>'mission'),btrim(brief->>'voice'),coalesce(brief->>'event_goal',''),choices)
 on conflict(organization_id) do update set coordinator=excluded.coordinator,area=excluded.area,mission=excluded.mission,voice=excluded.voice,event_goal=excluded.event_goal,platform_actions=excluded.platform_actions,updated_at=now();
 -- Selecting a channel expresses intent; it does not establish a connection or authorize posting.
 update public.platform_agents set selected=choices ? platform where organization_id=workspace;
 insert into public.vendor_activity(organization_id,actor_id,action) values(workspace,auth.uid(),'organization_brief_saved');
end $$;
revoke all on function public.save_organization_brief(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_organization_brief(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
