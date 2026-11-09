-- Browser agent runs: a computer-use model (Muse Wonder) drives an organization's Steel browser
-- one verified step at a time. Runs and their step events are member-readable; screenshots are
-- never stored. Only the server (service role) claims steps and records outcomes.
begin;
create table public.browser_agent_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connector text not null check (connector ~ '^[a-z][a-z0-9_]{1,39}$'),
  agent text not null default 'main' check (agent ~ '^(main|[a-z][a-z0-9_]{1,39})$'),
  objective text not null check (length(btrim(objective)) between 3 and 1000),
  mode text not null default 'read_only' check (mode in ('read_only')),
  status text not null default 'running' check (status in ('running','waiting_for_human','paused','succeeded','failed','cancelled')),
  status_detail text not null default '' check (length(status_detail) <= 1000),
  model text not null check (length(model) <= 80),
  step_count integer not null default 0,
  max_steps integer not null default 12 check (max_steps between 1 and 30),
  current_action text not null default '' check (length(current_action) <= 300),
  current_url text not null default '' check (length(current_url) <= 500),
  result jsonb check (result is null or (jsonb_typeof(result) = 'object' and octet_length(result::text) <= 20000)),
  usage jsonb not null default '{}'::jsonb check (jsonb_typeof(usage) = 'object'),
  plan_task_id uuid,
  chat_action_id uuid,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (organization_id, id)
);
create table public.browser_agent_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  run_id uuid not null,
  step integer not null default 0,
  kind text not null check (kind in ('started','observed','model','action','blocked','safety_check','human','result','error')),
  summary text not null check (length(summary) <= 500),
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object' and octet_length(detail::text) <= 8000),
  created_at timestamptz not null default now(),
  foreign key (organization_id, run_id) references public.browser_agent_runs(organization_id, id) on delete cascade
);
create index browser_agent_runs_recent on public.browser_agent_runs(organization_id, created_at desc);
create index browser_agent_events_run on public.browser_agent_events(run_id, created_at);
-- Private runtime: the Steel session and the model conversation state never reach clients.
create table private.browser_agent_runtime (
  run_id uuid primary key references public.browser_agent_runs(id) on delete cascade,
  provider_session uuid,
  profile_id uuid,
  previous_response_id text,
  pending_call jsonb,
  pending_safety_checks jsonb,
  acknowledged_safety_checks jsonb,
  lease_id uuid,
  lease_until timestamptz
);

alter table public.browser_agent_runs enable row level security;
alter table public.browser_agent_events enable row level security;
alter table private.browser_agent_runtime enable row level security;
create policy member_read on public.browser_agent_runs for select to authenticated using (private.is_member(organization_id));
create policy member_read on public.browser_agent_events for select to authenticated using (private.is_member(organization_id));
revoke all on public.browser_agent_runs, public.browser_agent_events from public, anon, authenticated;
revoke all on private.browser_agent_runtime from public, anon, authenticated;
grant select on public.browser_agent_runs, public.browser_agent_events to authenticated;
grant all on public.browser_agent_runs, public.browser_agent_events, private.browser_agent_runtime to service_role;

-- Start a run. Connection platforms need an owner or administrator (same as connecting them);
-- one live run per organization and platform; at most 40 runs per organization per day.
create function public.start_browser_agent_run(actor uuid, workspace uuid, target text, run_objective text, run_model text, steps integer default 12, task uuid default null, chat_action uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare item uuid;
begin
  if not exists(select 1 from public.organization_members where organization_id = workspace and user_id = actor and role in ('owner','admin')) then
    raise exception 'Only an organization owner or administrator can run the agent browser' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(workspace::text || target, 7));
  if exists(select 1 from public.browser_agent_runs where organization_id = workspace and connector = target and status in ('running','waiting_for_human','paused')) then
    raise exception 'The agent is already working in this browser. Stop that run first.';
  end if;
  if (select count(*) from public.browser_agent_runs where organization_id = workspace and created_at > now() - interval '24 hours') >= 40 then
    raise exception 'Daily agent browser allowance reached';
  end if;
  insert into public.browser_agent_runs(organization_id, connector, agent, objective, model, max_steps, plan_task_id, chat_action_id, created_by)
  values (workspace, target, case when target = 'web' then 'main' else target end, left(btrim(run_objective), 1000), run_model, greatest(1, least(steps, 30)), task, chat_action, actor)
  returning id into item;
  insert into private.browser_agent_runtime(run_id) values (item);
  insert into public.browser_agent_events(organization_id, run_id, kind, summary) values (workspace, item, 'started', left('Started: ' || btrim(run_objective), 500));
  return item;
end $$;

-- Claim the run for one step (or one control operation). Returns private runtime to the server only.
create function public.claim_browser_agent_run(actor uuid, workspace uuid, target_run uuid, lease_seconds integer default 120) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare run public.browser_agent_runs; runtime private.browser_agent_runtime;
begin
  if not exists(select 1 from public.organization_members where organization_id = workspace and user_id = actor and role in ('owner','admin')) then
    raise exception 'Only an organization owner or administrator can run the agent browser' using errcode = '42501';
  end if;
  select * into run from public.browser_agent_runs where id = target_run and organization_id = workspace for update;
  if not found then raise exception 'Unknown run'; end if;
  select * into runtime from private.browser_agent_runtime where run_id = run.id for update;
  if runtime.lease_until > now() then raise exception 'The agent is still working on the previous step.'; end if;
  update private.browser_agent_runtime set lease_id = gen_random_uuid(), lease_until = now() + make_interval(secs => greatest(10, least(lease_seconds, 180)))
  where run_id = run.id returning * into runtime;
  return jsonb_build_object('run', to_jsonb(run), 'runtime', to_jsonb(runtime));
end $$;

-- Record a step's verified outcome and release the lease.
create function public.finish_browser_agent_step(target_run uuid, lease uuid, outcome jsonb, events jsonb default '[]'::jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare run public.browser_agent_runs; runtime private.browser_agent_runtime; item jsonb; next_status text := outcome->>'status';
begin
  select * into runtime from private.browser_agent_runtime where run_id = target_run for update;
  if not found or runtime.lease_id is distinct from lease or runtime.lease_until < now() then raise exception 'Browser step lease expired'; end if;
  select * into run from public.browser_agent_runs where id = target_run for update;
  if next_status is not null and next_status not in ('running','waiting_for_human','paused','succeeded','failed','cancelled') then raise exception 'Invalid run status'; end if;
  update public.browser_agent_runs set
    status = coalesce(next_status, status),
    status_detail = coalesce(left(outcome->>'detail', 1000), status_detail),
    step_count = step_count + coalesce((outcome->>'steps')::integer, 0),
    current_action = coalesce(left(outcome->>'currentAction', 300), current_action),
    current_url = coalesce(left(outcome->>'currentUrl', 500), current_url),
    result = case when outcome ? 'result' then outcome->'result' else result end,
    usage = case when outcome ? 'usage' then outcome->'usage' else usage end,
    finished_at = case when next_status in ('succeeded','failed','cancelled') then now() else finished_at end,
    updated_at = now()
  where id = target_run;
  update private.browser_agent_runtime set
    provider_session = case when outcome ? 'providerSession' then nullif(outcome->>'providerSession','')::uuid else provider_session end,
    profile_id = case when outcome ? 'profileId' then nullif(outcome->>'profileId','')::uuid else profile_id end,
    previous_response_id = case when outcome ? 'previousResponseId' then nullif(outcome->>'previousResponseId','') else previous_response_id end,
    pending_call = case when outcome ? 'pendingCall' then nullif(outcome->'pendingCall', 'null'::jsonb) else pending_call end,
    pending_safety_checks = case when outcome ? 'pendingSafetyChecks' then nullif(outcome->'pendingSafetyChecks', 'null'::jsonb) else pending_safety_checks end,
    acknowledged_safety_checks = case when outcome ? 'acknowledgedSafetyChecks' then nullif(outcome->'acknowledgedSafetyChecks', 'null'::jsonb) else acknowledged_safety_checks end,
    lease_id = null, lease_until = null
  where run_id = target_run;
  for item in select * from jsonb_array_elements(case when jsonb_typeof(events) = 'array' then events else '[]'::jsonb end) loop
    insert into public.browser_agent_events(organization_id, run_id, step, kind, summary, detail)
    values (run.organization_id, run.id, coalesce((item->>'step')::integer, run.step_count), item->>'kind', left(coalesce(item->>'summary',''), 500), coalesce(item->'detail', '{}'::jsonb));
  end loop;
end $$;

-- The Steel profile the platform's connection uses (read by the server to open that account).
create function public.connector_browser_profile(workspace uuid, target text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('profileId', b.profile_id, 'providerSession', b.provider_session, 'status', c.status)
  from public.organization_connectors c left join private.connector_browser b using (organization_id, connector)
  where c.organization_id = workspace and c.connector = target;
$$;

revoke all on function public.start_browser_agent_run(uuid,uuid,text,text,text,integer,uuid,uuid), public.claim_browser_agent_run(uuid,uuid,uuid,integer),
  public.finish_browser_agent_step(uuid,uuid,jsonb,jsonb), public.connector_browser_profile(uuid,text) from public, anon, authenticated;
grant execute on function public.start_browser_agent_run(uuid,uuid,text,text,text,integer,uuid,uuid), public.claim_browser_agent_run(uuid,uuid,uuid,integer),
  public.finish_browser_agent_step(uuid,uuid,jsonb,jsonb), public.connector_browser_profile(uuid,text) to service_role;

do $$ begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.browser_agent_runs, public.browser_agent_events;
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
