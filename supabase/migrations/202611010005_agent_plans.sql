-- Agent plans: a goal from chat becomes a durable plan of tasks with dependencies, an owner agent,
-- an action level and a verified status. Members read; only the server (service role) claims and
-- finishes tasks; editors pause, resume, cancel and retry.
begin;
create table public.agent_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  thread_key text not null default 'main' check (thread_key ~ '^(main|platform_[a-z][a-z0-9_]{1,39})$'),
  title text not null check (length(btrim(title)) between 3 and 200),
  goal text not null check (length(btrim(goal)) between 3 and 2000),
  status text not null default 'active' check (status in ('active','paused','completed','cancelled')),
  source_run uuid,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
create table public.agent_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  plan_id uuid not null,
  position integer not null check (position between 1 and 12),
  title text not null check (length(btrim(title)) between 3 and 200),
  detail text not null default '' check (length(detail) <= 2000),
  agent text not null check (agent ~ '^(main|[a-z][a-z0-9_]{1,39})$'),
  kind text not null check (kind in ('research','find_venues','find_vendors','draft_content','create_event','connect_platform','platform_action')),
  level text not null check (level in ('research','prepare','communicate','commit')),
  depends_on integer[] not null default '{}',
  status text not null default 'queued' check (status in ('queued','working','waiting_approval','blocked','done','failed','cancelled')),
  status_detail text not null default '' check (length(status_detail) <= 500),
  input jsonb not null default '{}'::jsonb check (jsonb_typeof(input) = 'object'),
  result jsonb check (result is null or (jsonb_typeof(result) = 'object' and octet_length(result::text) <= 60000)),
  attempts integer not null default 0,
  lease_id uuid,
  lease_until timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (plan_id, position),
  foreign key (organization_id, plan_id) references public.agent_plans(organization_id, id) on delete cascade
);
create index agent_tasks_runnable on public.agent_tasks(organization_id, status, plan_id, position);
create index agent_plans_recent on public.agent_plans(organization_id, created_at desc);

alter table public.agent_plans enable row level security;
alter table public.agent_tasks enable row level security;
create policy member_read on public.agent_plans for select to authenticated using (private.is_member(organization_id));
create policy member_read on public.agent_tasks for select to authenticated using (private.is_member(organization_id));
revoke all on public.agent_plans, public.agent_tasks from public, anon, authenticated;
grant select on public.agent_plans, public.agent_tasks to authenticated;
grant all on public.agent_plans, public.agent_tasks to service_role;

create function private.require_plan_editor(actor uuid, workspace uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.organization_members where organization_id = workspace and user_id = actor and role in ('owner','admin','organizer')) then
    raise exception 'Organization editor access required' using errcode = '42501';
  end if;
end $$;

-- The level is decided here from the kind, never by the model: research and preparation run on
-- their own; anything that communicates or commits waits for a person.
create function private.agent_task_level(task_kind text) returns text
language sql immutable set search_path = '' as $$
  select case
    when task_kind in ('research','find_venues','find_vendors') then 'research'
    when task_kind in ('draft_content','create_event','connect_platform') then 'prepare'
    else 'communicate' end;
$$;

create function public.create_agent_plan(actor uuid, workspace uuid, plan jsonb, source uuid default null, thread text default 'main') returns uuid
language plpgsql security definer set search_path = '' as $$
declare item uuid; step jsonb; i integer := 0; deps integer[];
begin
  perform private.require_plan_editor(actor, workspace);
  if jsonb_typeof(plan->'steps') <> 'array' or jsonb_array_length(plan->'steps') not between 1 and 8 then
    raise exception 'A plan needs between one and eight steps';
  end if;
  if (select count(*) from public.agent_plans where organization_id = workspace and status = 'active') >= 5 then
    raise exception 'Five plans are already active. Finish, pause or stop one first.';
  end if;
  insert into public.agent_plans(organization_id, thread_key, title, goal, source_run, created_by)
  values (workspace, thread, left(btrim(plan->>'title'), 200), left(btrim(plan->>'goal'), 2000), source, actor) returning id into item;
  for step in select * from jsonb_array_elements(plan->'steps') loop
    i := i + 1;
    -- A step waits only for the earlier steps it names, so one blocked step never stalls the rest.
    select coalesce(array_agg(distinct n) filter (where n between 1 and i - 1), '{}'::integer[])
      into deps from (select case when value ~ '^[0-9]{1,2}$' then value::integer end as n
        from jsonb_array_elements_text(case when jsonb_typeof(step->'dependsOn') = 'array' then step->'dependsOn' else '[]'::jsonb end)) numbers;
    insert into public.agent_tasks(organization_id, plan_id, position, title, detail, agent, kind, level, depends_on, input)
    values (workspace, item, i, left(btrim(step->>'title'), 200), left(coalesce(step->>'detail', ''), 2000), coalesce(step->>'agent', 'main'),
      step->>'kind', private.agent_task_level(step->>'kind'), deps, coalesce(step->'input', '{}'::jsonb));
  end loop;
  insert into public.vendor_activity(organization_id, actor_id, action) values (workspace, actor, 'agent_plan_started');
  return item;
end $$;

-- Claim the next runnable task of an active plan: queued, every dependency done, no live lease.
create function public.claim_agent_task(actor uuid, workspace uuid, target_plan uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare plan public.agent_plans; task public.agent_tasks;
begin
  perform private.require_plan_editor(actor, workspace);
  select * into plan from public.agent_plans where id = target_plan and organization_id = workspace for update;
  if not found then raise exception 'Unknown plan'; end if;
  if plan.status <> 'active' then return null; end if;
  -- Interrupted work is retried up to three times, then reported as failed.
  update public.agent_tasks set status = 'failed', status_detail = 'Stopped responding three times. Retry when ready.', lease_id = null, lease_until = null, finished_at = now(), updated_at = now()
    where plan_id = plan.id and status = 'working' and lease_until <= now() and attempts >= 3;
  update public.agent_tasks set status = 'queued', lease_id = null, lease_until = null, updated_at = now()
    where plan_id = plan.id and status = 'working' and lease_until <= now();
  if exists(select 1 from public.agent_tasks where plan_id = plan.id and status = 'working') then return null; end if;
  select t.* into task from public.agent_tasks t
    where t.plan_id = plan.id and t.status = 'queued'
      and not exists(select 1 from public.agent_tasks d where d.plan_id = plan.id and d.position = any(t.depends_on) and d.status <> 'done')
    order by t.position for update skip locked limit 1;
  if not found then return null; end if;
  if task.level = 'research' and (select count(*) from public.agent_tasks where organization_id = workspace and level = 'research' and started_at > now() - interval '24 hours') >= 30 then
    update public.agent_tasks set status_detail = 'Daily research allowance reached. This step resumes tomorrow.', updated_at = now() where id = task.id;
    return null;
  end if;
  update public.agent_tasks set status = 'working', status_detail = '', lease_id = gen_random_uuid(), lease_until = now() + interval '150 seconds',
    attempts = attempts + 1, started_at = coalesce(started_at, now()), updated_at = now()
    where id = task.id returning * into task;
  update public.agent_plans set updated_at = now() where id = plan.id;
  return jsonb_build_object('task', to_jsonb(task), 'plan', to_jsonb(plan));
end $$;

create function public.finish_agent_task(target_task uuid, lease uuid, outcome jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare task public.agent_tasks; next_status text := outcome->>'status';
begin
  if next_status not in ('done','failed','waiting_approval','blocked','queued') then raise exception 'Invalid task outcome'; end if;
  select * into task from public.agent_tasks where id = target_task for update;
  if not found or task.status <> 'working' or task.lease_id is distinct from lease or task.lease_until < now() then
    raise exception 'Task lease expired';
  end if;
  update public.agent_tasks set status = next_status, status_detail = left(coalesce(outcome->>'detail', ''), 500),
    result = case when outcome ? 'result' then outcome->'result' else result end,
    lease_id = null, lease_until = null,
    finished_at = case when next_status in ('done','failed') then now() else finished_at end, updated_at = now()
  where id = task.id;
  perform private.settle_agent_plan(task.plan_id);
  insert into public.vendor_activity(organization_id, actor_id, action)
  select task.organization_id, p.created_by, 'agent_task_' || next_status || ':' || left(task.title, 120) from public.agent_plans p where p.id = task.plan_id;
end $$;

-- Waiting tasks move on when their approval is decided (the server checks approvals).
create function public.update_waiting_agent_task(target_task uuid, outcome jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare task public.agent_tasks; next_status text := outcome->>'status';
begin
  if next_status not in ('done','blocked','cancelled') then raise exception 'Invalid task outcome'; end if;
  select * into task from public.agent_tasks where id = target_task for update;
  if not found or task.status <> 'waiting_approval' then return; end if;
  update public.agent_tasks set status = next_status, status_detail = left(coalesce(outcome->>'detail', ''), 500),
    finished_at = case when next_status in ('done','cancelled') then now() else finished_at end, updated_at = now() where id = task.id;
  perform private.settle_agent_plan(task.plan_id);
end $$;

create function private.settle_agent_plan(target_plan uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.agent_plans set status = 'completed', updated_at = now()
  where id = target_plan and status = 'active'
    and not exists(select 1 from public.agent_tasks where plan_id = target_plan and status in ('queued','working','waiting_approval','blocked'));
end $$;

-- Editors control their plans directly from the dashboard.
create function public.control_agent_plan(target_plan uuid, action text) returns void
language plpgsql security definer set search_path = '' as $$
declare plan public.agent_plans;
begin
  select * into plan from public.agent_plans where id = target_plan for update;
  if not found or not private.can_edit(plan.organization_id) then raise exception 'Organization editor access required' using errcode = '42501'; end if;
  if action = 'pause' and plan.status = 'active' then
    update public.agent_plans set status = 'paused', updated_at = now() where id = plan.id;
  elsif action = 'resume' and plan.status = 'paused' then
    update public.agent_plans set status = 'active', updated_at = now() where id = plan.id;
  elsif action = 'cancel' and plan.status in ('active','paused') then
    update public.agent_plans set status = 'cancelled', updated_at = now() where id = plan.id;
    update public.agent_tasks set status = 'cancelled', status_detail = 'Stopped by the team.', lease_id = null, lease_until = null, finished_at = now(), updated_at = now()
      where plan_id = plan.id and status in ('queued','working','waiting_approval','blocked');
  else
    raise exception 'That change is not available for this plan';
  end if;
  insert into public.vendor_activity(organization_id, actor_id, action) values (plan.organization_id, auth.uid(), 'agent_plan_' || action);
end $$;

create function public.retry_agent_task(target_task uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare task public.agent_tasks;
begin
  select * into task from public.agent_tasks where id = target_task for update;
  if not found or not private.can_edit(task.organization_id) then raise exception 'Organization editor access required' using errcode = '42501'; end if;
  if task.status not in ('failed','blocked') then raise exception 'Only failed or blocked steps can be retried'; end if;
  update public.agent_tasks set status = 'queued', status_detail = '', attempts = 0, finished_at = null, updated_at = now() where id = task.id;
  update public.agent_plans set status = 'active', updated_at = now() where id = task.plan_id and status = 'completed';
end $$;

revoke all on function public.create_agent_plan(uuid,uuid,jsonb,uuid,text), public.claim_agent_task(uuid,uuid,uuid), public.finish_agent_task(uuid,uuid,jsonb),
  public.update_waiting_agent_task(uuid,jsonb), private.require_plan_editor(uuid,uuid), private.settle_agent_plan(uuid), private.agent_task_level(text)
  from public, anon, authenticated;
grant execute on function public.create_agent_plan(uuid,uuid,jsonb,uuid,text), public.claim_agent_task(uuid,uuid,uuid), public.finish_agent_task(uuid,uuid,jsonb),
  public.update_waiting_agent_task(uuid,jsonb) to service_role;
revoke all on function public.control_agent_plan(uuid,text), public.retry_agent_task(uuid) from public, anon;
grant execute on function public.control_agent_plan(uuid,text), public.retry_agent_task(uuid) to authenticated;

do $$ begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.agent_plans, public.agent_tasks;
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
