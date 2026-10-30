begin;
create table public.organization_knowledge (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check(length(btrim(title)) between 2 and 200),
  content text not null check(length(btrim(content)) between 1 and 12000),
  source_url text not null default '' check(source_url='' or (length(source_url)<=2048 and source_url ~ '^https?://[^[:space:]@]+$')),
  created_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);
create table public.agent_memory (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  agent_id uuid not null,
  memory_key text not null check(length(memory_key) between 1 and 160),
  kind text not null check(kind in ('fact','conversation_summary','follow_up','checkpoint')),
  content text not null check(length(btrim(content)) between 1 and 12000),
  source_url text not null default '' check(source_url='' or (length(source_url)<=2048 and source_url ~ '^https?://[^[:space:]@]+$')),
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key(organization_id,agent_id) references public.platform_agents(organization_id,id) on delete cascade,
  unique(agent_id,memory_key)
);
create index agent_memory_scope on public.agent_memory(organization_id,agent_id,updated_at desc);
create table public.agent_work_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  agent_id uuid not null,
  objective text not null check(length(btrim(objective)) between 10 and 4000),
  status text not null default 'queued' check(status in ('queued','running','completed','failed')),
  due_at timestamptz not null default now(),
  lease_id uuid,
  lease_until timestamptz,
  attempts integer not null default 0,
  result text not null default '' check(length(result)<=12000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(organization_id,agent_id) references public.platform_agents(organization_id,id) on delete cascade
);
create index agent_work_scope on public.agent_work_items(agent_id,status,due_at);
alter table public.organization_knowledge enable row level security;
alter table public.agent_memory enable row level security;
alter table public.agent_work_items enable row level security;
create policy member_read on public.organization_knowledge for select to authenticated using(private.is_member(organization_id));
create policy member_read on public.agent_memory for select to authenticated using(private.is_member(organization_id));
create policy member_read on public.agent_work_items for select to authenticated using(private.is_member(organization_id));
revoke all on public.organization_knowledge,public.agent_memory,public.agent_work_items from anon,authenticated;
grant select on public.organization_knowledge,public.agent_memory,public.agent_work_items to authenticated;

create function private.resolve_agent(token text) returns public.platform_agents
language plpgsql security definer set search_path = '' as $$
declare agent public.platform_agents;
begin
  if length(coalesce(token,'')) not between 32 and 256 then raise exception 'Invalid agent credential'; end if;
  select a.* into agent from private.agent_credentials c join public.platform_agents a on a.id=c.agent_id
    where c.token_hash=sha256(convert_to(token,'UTF8')) and not a.paused;
  if not found then raise exception 'Invalid or paused agent credential'; end if;
  return agent;
end; $$;

create function public.save_organization_knowledge(workspace uuid, entry_title text, entry_content text, entry_source text default '') returns uuid
language plpgsql security definer set search_path = '' as $$
declare entry uuid;
begin
  if not private.can_edit(workspace) then raise exception 'Organization editor access required'; end if;
  insert into public.organization_knowledge(organization_id,title,content,source_url,created_by)
    values(workspace,entry_title,entry_content,entry_source,auth.uid()) returning id into entry;
  return entry;
end; $$;

create function public.remember_agent(agent_token text, entry_key text, entry_kind text, entry_content text, entry_source text default '', expiry timestamptz default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare agent public.platform_agents; entry uuid;
begin
  agent:=private.resolve_agent(agent_token);
  insert into public.agent_memory(organization_id,agent_id,memory_key,kind,content,source_url,expires_at)
    values(agent.organization_id,agent.id,entry_key,entry_kind,entry_content,entry_source,expiry)
    on conflict(agent_id,memory_key) do update set kind=excluded.kind,content=excluded.content,source_url=excluded.source_url,expires_at=excluded.expires_at,updated_at=now()
    returning id into entry;
  return entry;
end; $$;

create function public.recall_agent_context(agent_token text, search_text text default '', page_offset integer default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare agent public.platform_agents; result jsonb;
begin
  agent:=private.resolve_agent(agent_token);
  select jsonb_build_object('agent_id',agent.id,'organization_id',agent.organization_id,'platform',agent.platform,'name',agent.name,'instructions',agent.instructions,
    'memory',coalesce((select jsonb_agg(to_jsonb(m)) from (select * from public.agent_memory where agent_id=agent.id
      and (expires_at is null or expires_at>now()) and position(lower(left(coalesce(search_text,''),200)) in lower(content||' '||memory_key))>0
      order by updated_at desc,id limit 30 offset greatest(coalesce(page_offset,0),0)) m),'[]'::jsonb),
    'organization_knowledge',coalesce((select jsonb_agg(to_jsonb(k)) from (select * from public.organization_knowledge where organization_id=agent.organization_id
      and position(lower(left(coalesce(search_text,''),200)) in lower(title||' '||content))>0
      order by updated_at desc,id limit 30 offset greatest(coalesce(page_offset,0),0)) k),'[]'::jsonb)) into result;
  return result;
end; $$;

create function public.enqueue_agent_work(target_agent uuid, task_objective text, scheduled_for timestamptz default now()) returns uuid
language plpgsql security definer set search_path = '' as $$
declare org uuid; task uuid;
begin
  select organization_id into org from public.platform_agents where id=target_agent;
  if org is null or not private.can_edit(org) then raise exception 'Organization editor access required'; end if;
  insert into public.agent_work_items(organization_id,agent_id,objective,due_at,created_by)
    values(org,target_agent,task_objective,coalesce(scheduled_for,now()),auth.uid()) returning id into task;
  return task;
end; $$;

create function public.claim_agent_work(agent_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare agent public.platform_agents; task public.agent_work_items;
begin
  agent:=private.resolve_agent(agent_token);
  -- Only one live lease per agent, even if several workers attempt to claim.
  perform pg_advisory_xact_lock(hashtextextended(agent.id::text,1));
  if exists(select 1 from public.agent_work_items where agent_id=agent.id and status='running' and lease_until>now()) then return null; end if;
  update public.agent_work_items set status='failed',result='Worker lease expired after three attempts.',updated_at=now(),lease_id=null,lease_until=null
    where agent_id=agent.id and status='running' and lease_until<=now() and attempts>=3;
  select * into task from public.agent_work_items where agent_id=agent.id and due_at<=now()
    and (status='queued' or (status='running' and lease_until<=now() and attempts<3))
    order by due_at,created_at,id for update skip locked limit 1;
  if not found then return null; end if;
  update public.agent_work_items set status='running',lease_id=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=attempts+1,updated_at=now()
    where id=task.id returning * into task;
  return to_jsonb(task);
end; $$;

create function public.finish_agent_work(agent_token text, task_id uuid, task_lease uuid, succeeded boolean, outcome text) returns void
language plpgsql security definer set search_path = '' as $$
declare agent public.platform_agents;
begin
  agent:=private.resolve_agent(agent_token);
  update public.agent_work_items set status=case when succeeded then 'completed' else 'failed' end,result=outcome,lease_id=null,lease_until=null,updated_at=now()
    where id=task_id and agent_id=agent.id and status='running' and lease_id=task_lease and lease_until>now();
  if not found then raise exception 'No active lease for this agent and work item'; end if;
end; $$;

create function private.vendor_directory(workspace uuid, search_text text, service_area text, review_status text, page_size integer, page_offset integer) returns jsonb
language sql stable security definer set search_path = '' as $$
  with matching as (
    select v.* from public.vendors v where v.organization_id=workspace
      and position(lower(left(coalesce(search_text,''),200)) in lower(v.name||' '||v.category))>0
      and position(lower(left(coalesce(service_area,''),160)) in lower(array_to_string(v.service_areas,', ')))>0
      and (coalesce(review_status,'')='' or v.status=review_status)
  ), paged as (
    select m.*,coalesce((select jsonb_agg(jsonb_build_object('platform',l.platform,'url',l.url)) from public.vendor_links l where l.vendor_id=m.id),'[]'::jsonb) as links
    from matching m order by m.updated_at desc,m.id limit least(greatest(coalesce(page_size,25),1),50) offset greatest(coalesce(page_offset,0),0)
  ) select jsonb_build_object('total',(select count(*) from matching),'vendors',coalesce((select jsonb_agg(to_jsonb(p)) from paged p),'[]'::jsonb));
$$;
create function public.search_vendor_directory(workspace uuid, search_text text default '', service_area text default '', review_status text default '', page_size integer default 25, page_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_member(workspace) then raise exception 'Organization access required'; end if;
  return private.vendor_directory(workspace,search_text,service_area,review_status,page_size,page_offset);
end; $$;
create function public.search_agent_vendors(agent_token text, search_text text default '', service_area text default '', page_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare agent public.platform_agents;
begin
  agent:=private.resolve_agent(agent_token);
  -- Include review status; workers must not assume an unverified observation is fact.
  return private.vendor_directory(agent.organization_id,search_text,service_area,'',25,page_offset);
end; $$;

revoke all on function private.resolve_agent(text),private.vendor_directory(uuid,text,text,text,integer,integer) from public,anon,authenticated;
revoke all on function public.save_organization_knowledge(uuid,text,text,text),public.remember_agent(text,text,text,text,text,timestamptz),public.recall_agent_context(text,text,integer),public.enqueue_agent_work(uuid,text,timestamptz),public.claim_agent_work(text),public.finish_agent_work(text,uuid,uuid,boolean,text),public.search_vendor_directory(uuid,text,text,text,integer,integer),public.search_agent_vendors(text,text,text,integer) from public,anon,authenticated;
grant execute on function public.save_organization_knowledge(uuid,text,text,text),public.enqueue_agent_work(uuid,text,timestamptz),public.search_vendor_directory(uuid,text,text,text,integer,integer) to authenticated;
grant execute on function public.remember_agent(text,text,text,text,text,timestamptz),public.recall_agent_context(text,text,integer),public.claim_agent_work(text),public.finish_agent_work(text,uuid,uuid,boolean,text),public.search_agent_vendors(text,text,text,integer) to anon,authenticated;
notify pgrst,'reload schema';
commit;
