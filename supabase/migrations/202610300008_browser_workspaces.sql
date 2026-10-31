begin;
create table public.browser_sites (
 organization_id uuid not null references public.organizations(id), origin text not null check(origin ~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?$'),
 approved_by uuid not null references auth.users(id), created_at timestamptz not null default now(), primary key(organization_id,origin)
);
alter table public.browser_sites enable row level security;
create policy member_read on public.browser_sites for select to authenticated using(private.is_member(organization_id));
create policy admin_insert on public.browser_sites for insert to authenticated with check(private.is_admin(organization_id) and approved_by=auth.uid());
create policy admin_delete on public.browser_sites for delete to authenticated using(private.is_admin(organization_id));
revoke all on public.browser_sites from public,anon,authenticated;
grant select,insert,delete on public.browser_sites to authenticated;
grant all on public.browser_sites to service_role;
create table public.browser_workspaces (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 agent_id uuid not null unique, state text not null default 'not_connected' check(state in ('not_connected','connecting','authentication_required','waiting_for_human','human_controlling','ready','agent_working','waiting_for_approval','paused','completed','session_expired','failed')),
 current_origin text not null default '' check(length(current_origin)<=300), task text not null default '' check(length(task)<=500),
 human_actor uuid references auth.users(id), expires_at timestamptz, updated_at timestamptz not null default now(),
 foreign key(organization_id,agent_id) references public.platform_agents(organization_id,id), unique(organization_id,id)
);
create table private.browser_runtime (
 workspace_id uuid primary key references public.browser_workspaces(id),
 provider_session uuid, profile_id uuid, checkpoint_url text not null default '',
 operation_id uuid, operation_until timestamptz
);
create table public.browser_actions (
 id uuid primary key, organization_id uuid not null, workspace_id uuid not null,
 actor_id uuid not null references auth.users(id), action text not null check(action in ('start','observe','pause','takeover','resume','disconnect','navigate','scroll')),
 outcome text not null default 'started' check(outcome in ('started','succeeded','failed','interrupted')),
 created_at timestamptz not null default now(), finished_at timestamptz,
 foreign key(organization_id,workspace_id) references public.browser_workspaces(organization_id,id)
);
create index browser_actions_recent on public.browser_actions(organization_id,created_at desc);
alter table public.browser_workspaces enable row level security;
alter table public.browser_actions enable row level security;
create policy organization_read on public.browser_workspaces for select to authenticated using(private.is_member(organization_id));
create policy organization_read on public.browser_actions for select to authenticated using(private.is_member(organization_id));
revoke all on public.browser_workspaces,public.browser_actions from public,anon,authenticated;
grant select on public.browser_workspaces,public.browser_actions to authenticated;
grant all on public.browser_workspaces,public.browser_actions,private.browser_runtime to service_role;

-- Only the authenticated server may reserve browser operations. Every claim rechecks the actor.
create function public.claim_browser_operation(actor uuid, workspace uuid, target_agent uuid, request_key uuid, operation text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item public.browser_workspaces; runtime private.browser_runtime; agent public.platform_agents;
begin
 if not exists(select 1 from public.organization_members where organization_id=workspace and user_id=actor and role in ('owner','admin')) then raise exception 'Administrator access required'; end if;
 select * into agent from public.platform_agents where id=target_agent and organization_id=workspace for update;
 if not found then raise exception 'Unknown organization agent'; end if;
 if operation not in ('observe','pause','disconnect') and (agent.paused or not agent.selected or agent.platform<>'web') then raise exception 'Browser work is not enabled for this channel'; end if;
 insert into public.browser_workspaces(organization_id,agent_id) values(workspace,target_agent) on conflict(agent_id) do nothing;
 select * into item from public.browser_workspaces where agent_id=target_agent for update;
 insert into private.browser_runtime(workspace_id) values(item.id) on conflict do nothing;
 select * into runtime from private.browser_runtime where workspace_id=item.id for update;
 if runtime.operation_until>now() then raise exception 'Browser operation in progress'; end if;
 if runtime.operation_id is not null and operation not in ('disconnect','pause') then raise exception 'Interrupted operation: stop the browser before reconnecting'; end if;
 if runtime.operation_id is not null then
  update public.browser_actions set outcome='interrupted',finished_at=now() where id=runtime.operation_id and outcome='started';
 end if;
 if exists(select 1 from public.browser_actions where id=request_key) then raise exception 'Request already used. Refresh before another action.'; end if;
 -- Enforce a per-organization creation budget independent of concurrent web requests.
 if operation in ('start','takeover','resume') and (select count(*) from public.browser_actions where organization_id=workspace and action in ('start','takeover','resume') and created_at>now()-interval '24 hours')>=30 then raise exception 'Daily browser session allowance reached'; end if;
 insert into public.browser_actions(id,organization_id,workspace_id,actor_id,action) values(request_key,workspace,item.id,actor,operation);
 update private.browser_runtime set operation_id=request_key,operation_until=now()+interval '120 seconds' where workspace_id=item.id;
 update public.browser_workspaces set state=case when operation in ('start','resume') then 'connecting' when operation='takeover' then 'waiting_for_human' when operation in ('navigate','scroll') then 'agent_working' else state end,updated_at=now() where id=item.id;
 return jsonb_build_object('workspace',to_jsonb(item),'runtime',to_jsonb(runtime));
end $$;

create function public.finish_browser_operation(request_key uuid, result jsonb, success boolean) returns void
language plpgsql security definer set search_path='' as $$
declare runtime private.browser_runtime;
begin
 select * into runtime from private.browser_runtime where operation_id=request_key for update;
 if not found or runtime.operation_until<now() then raise exception 'Browser operation lease expired'; end if;
 update public.browser_workspaces set state=result->>'state',current_origin=coalesce(result->>'origin',''),task=coalesce(result->>'task',''),
 human_actor=nullif(result->>'humanActor','')::uuid,expires_at=nullif(result->>'expiresAt','')::timestamptz,updated_at=now() where id=runtime.workspace_id;
 update private.browser_runtime set provider_session=nullif(result->>'providerSession','')::uuid,profile_id=nullif(result->>'profileId','')::uuid,
 checkpoint_url=coalesce(result->>'checkpointUrl',''),operation_id=null,operation_until=null where workspace_id=runtime.workspace_id;
 update public.browser_actions set outcome=case when success then 'succeeded' else 'failed' end,finished_at=now() where id=request_key;
end $$;
revoke all on function public.claim_browser_operation(uuid,uuid,uuid,uuid,text),public.finish_browser_operation(uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.claim_browser_operation(uuid,uuid,uuid,uuid,text),public.finish_browser_operation(uuid,jsonb,boolean) to service_role;
notify pgrst,'reload schema';
commit;
