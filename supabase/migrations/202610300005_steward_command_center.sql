begin;
create table public.community_needs (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 title text not null check(length(btrim(title)) between 3 and 200), detail text not null default '' check(length(detail)<=4000),
 kind text not null check(kind in ('question','resource','concern','gathering','celebration')),
 source_url text not null default '' check(source_url='' or (length(source_url)<=2048 and source_url ~ '^https?://[^[:space:]@]+$')),
 priority text not null check(priority in ('normal','high')), status text not null default 'open' check(status in ('open','resolved')),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id)
);
create table public.steward_plans (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 need_id uuid, title text not null check(length(btrim(title)) between 3 and 200),
 contribution text not null check(length(btrim(contribution)) between 10 and 4000),
 connection text not null default '' check(length(connection)<=4000), gathering text not null default '' check(length(gathering)<=4000),
 follow_up text not null check(length(btrim(follow_up)) between 3 and 4000), follow_up_on date not null,
 status text not null default 'draft' check(status in ('draft','approved','completed')),
 revision integer not null default 1, approved_revision integer, approved_by uuid references auth.users(id), approved_at timestamptz,
 outcome text not null default '' check(length(outcome)<=4000), created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,need_id) references public.community_needs(organization_id,id), unique(organization_id,id)
);
create table public.steward_research_runs (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 plan_id uuid, request_id uuid not null, requested_by uuid not null references auth.users(id),
 input jsonb not null, status text not null default 'running' check(status in ('running','completed','failed')),
 result jsonb, error text, created_at timestamptz not null default now(), finished_at timestamptz,
 unique(organization_id,request_id), foreign key(organization_id,plan_id) references public.steward_plans(organization_id,id)
);
create index community_needs_scope on public.community_needs(organization_id,status,created_at desc);
create index steward_plans_scope on public.steward_plans(organization_id,status,follow_up_on);
create index steward_research_scope on public.steward_research_runs(organization_id,created_at desc);
alter table public.community_needs enable row level security;
alter table public.steward_plans enable row level security;
alter table public.steward_research_runs enable row level security;
create policy member_read on public.community_needs for select to authenticated using(private.is_member(organization_id));
create policy member_read on public.steward_plans for select to authenticated using(private.is_member(organization_id));
create policy member_read on public.steward_research_runs for select to authenticated using(private.is_member(organization_id));
revoke all on public.community_needs,public.steward_plans,public.steward_research_runs from public,anon,authenticated;
grant select on public.community_needs,public.steward_plans,public.steward_research_runs to authenticated;
grant all on public.community_needs,public.steward_plans,public.steward_research_runs to service_role;

create function public.record_community_need(workspace uuid, need_title text, need_detail text, need_kind text, source text default '', urgency text default 'normal') returns uuid
language plpgsql security definer set search_path='' as $$
declare item uuid;
begin
 if not private.can_edit(workspace) then raise exception 'Organization editor access required'; end if;
 insert into public.community_needs(organization_id,title,detail,kind,source_url,priority,created_by)
 values(workspace,btrim(need_title),need_detail,need_kind,source,urgency,auth.uid()) returning id into item;
 insert into public.vendor_activity(organization_id,actor_id,action) values(workspace,auth.uid(),'community_need_recorded');
 return item;
end; $$;
create function public.resolve_community_need(target_need uuid, resolved boolean) returns void
language plpgsql security definer set search_path='' as $$
declare org uuid;
begin
 select organization_id into org from public.community_needs where id=target_need;
 if not private.can_edit(org) then raise exception 'Organization editor access required'; end if;
 update public.community_needs set status=case when resolved then 'resolved' else 'open' end,updated_at=now() where id=target_need;
 insert into public.vendor_activity(organization_id,actor_id,action) values(org,auth.uid(),case when resolved then 'community_need_resolved' else 'community_need_reopened' end);
end; $$;
create function public.save_steward_plan(workspace uuid, plan jsonb, target_plan uuid default null, expected_revision integer default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare item uuid; previous public.steward_plans;
begin
 if not private.can_edit(workspace) then raise exception 'Organization editor access required'; end if;
 if target_plan is null then
  insert into public.steward_plans(organization_id,need_id,title,contribution,connection,gathering,follow_up,follow_up_on,created_by)
  values(workspace,nullif(plan->>'need_id','')::uuid,btrim(plan->>'title'),plan->>'contribution',coalesce(plan->>'connection',''),coalesce(plan->>'gathering',''),plan->>'follow_up',(plan->>'follow_up_on')::date,auth.uid()) returning id into item;
 else
  select * into previous from public.steward_plans where id=target_plan and organization_id=workspace for update;
  if not found or previous.revision is distinct from expected_revision or previous.status='completed' then raise exception 'Plan changed or is complete. Refresh before editing.'; end if;
  update public.steward_plans set title=btrim(plan->>'title'),need_id=nullif(plan->>'need_id','')::uuid,
   contribution=plan->>'contribution',connection=coalesce(plan->>'connection',''),gathering=coalesce(plan->>'gathering',''),follow_up=plan->>'follow_up',follow_up_on=(plan->>'follow_up_on')::date,
   revision=revision+1,status='draft',approved_revision=null,approved_by=null,approved_at=null,updated_at=now() where id=target_plan;
  item:=target_plan;
 end if;
 insert into public.vendor_activity(organization_id,actor_id,action) values(workspace,auth.uid(),'steward_plan_drafted');
 return item;
end; $$;
create function public.review_steward_plan(target_plan uuid, expected_revision integer, decision text, result_note text default '') returns void
language plpgsql security definer set search_path='' as $$
declare plan public.steward_plans;
begin
 select * into plan from public.steward_plans where id=target_plan for update;
 if not found or not private.is_admin(plan.organization_id) then raise exception 'Organization administrator access required'; end if;
 if plan.revision is distinct from expected_revision then raise exception 'Plan changed. Review the latest revision.'; end if;
 if decision='approve' and plan.status='draft' then
  update public.steward_plans set status='approved',approved_revision=revision,approved_by=auth.uid(),approved_at=now(),updated_at=now() where id=target_plan;
 elsif decision='complete' and plan.status='approved' and plan.approved_revision=plan.revision and length(btrim(result_note)) between 10 and 4000 then
  update public.steward_plans set status='completed',outcome=btrim(result_note),updated_at=now() where id=target_plan;
 else raise exception 'Invalid plan transition or missing outcome'; end if;
 insert into public.vendor_activity(organization_id,actor_id,action) values(plan.organization_id,auth.uid(),'steward_plan_'||decision);
end; $$;

-- These two functions are server-only. User identity is verified by the HTTP handler.
create function public.reserve_steward_research(actor uuid, workspace uuid, request_key uuid, research_input jsonb, target_plan uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare existing public.steward_research_runs; item uuid;
begin
 if not exists(select 1 from public.organization_members where organization_id=workspace and user_id=actor and role in ('owner','admin','organizer')) then raise exception 'Organization editor access required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(workspace::text,42));
 select * into existing from public.steward_research_runs where organization_id=workspace and request_id=request_key;
 if found then return jsonb_build_object('started',false,'run',to_jsonb(existing)); end if;
 if length(btrim(coalesce(research_input->>'question',''))) not between 10 and 3000 or length(coalesce(research_input->>'location',''))>160
 or coalesce(research_input->>'purpose','') not in ('resources','venues','vendors','events','general') then raise exception 'Invalid research input'; end if;
 update public.steward_research_runs set status='failed',error='The research worker stopped before saving a result. Start a new request to retry.',finished_at=now()
 where organization_id=workspace and status='running' and created_at<now()-interval '3 minutes';
 if exists(select 1 from public.steward_research_runs where organization_id=workspace and status='running') then raise exception 'Research already running for this organization'; end if;
 if (select count(*) from public.steward_research_runs where organization_id=workspace and created_at>now()-interval '24 hours')>=10 then raise exception 'Organization research limit reached (10 requests per 24 hours)'; end if;
 insert into public.steward_research_runs(organization_id,plan_id,request_id,requested_by,input) values(workspace,target_plan,request_key,actor,research_input) returning id into item;
 select * into existing from public.steward_research_runs where id=item;
 return jsonb_build_object('started',true,'run',to_jsonb(existing));
end; $$;
create function public.finish_steward_research(target_run uuid, research_result jsonb default null, failure text default null) returns void
language plpgsql security definer set search_path='' as $$
declare run public.steward_research_runs;
begin
 select * into run from public.steward_research_runs where id=target_run for update;
 if not found or run.status<>'running' then raise exception 'Research run is no longer active'; end if;
 if research_result is not null then
  if length(coalesce(research_result->>'answer',''))<1 or octet_length(research_result::text)>100000 then raise exception 'Invalid research result'; end if;
  update public.steward_research_runs set status='completed',result=research_result,finished_at=now() where id=target_run;
  insert into public.organization_knowledge(organization_id,title,content,source_url,created_by)
  values(run.organization_id,left('Research: '||(run.input->>'question'),200),left(research_result->>'answer',10000)||E'\nSources: '||left(coalesce((research_result->'sources')::text,'[]'),1800)||E'\nFull research record: '||run.id::text,coalesce(research_result->'sources'->0->>'url',''),run.requested_by);
 else
  update public.steward_research_runs set status='failed',error=left(coalesce(failure,'Research could not finish.'),500),finished_at=now() where id=target_run;
 end if;
 insert into public.vendor_activity(organization_id,actor_id,action) values(run.organization_id,run.requested_by,case when research_result is null then 'steward_research_failed' else 'steward_research_completed' end);
end; $$;
revoke all on function public.record_community_need(uuid,text,text,text,text,text),public.resolve_community_need(uuid,boolean),public.save_steward_plan(uuid,jsonb,uuid,integer),public.review_steward_plan(uuid,integer,text,text),public.reserve_steward_research(uuid,uuid,uuid,jsonb,uuid),public.finish_steward_research(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.record_community_need(uuid,text,text,text,text,text),public.resolve_community_need(uuid,boolean),public.save_steward_plan(uuid,jsonb,uuid,integer),public.review_steward_plan(uuid,integer,text,text) to authenticated;
grant execute on function public.reserve_steward_research(uuid,uuid,uuid,jsonb,uuid),public.finish_steward_research(uuid,jsonb,text) to service_role;
notify pgrst, 'reload schema';
commit;
