-- A run can record that Meta only offered computer use on Muse Spark for this account.
begin;
create or replace function public.finish_browser_agent_step(target_run uuid, lease uuid, outcome jsonb, events jsonb default '[]'::jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare run public.browser_agent_runs; runtime private.browser_agent_runtime; item jsonb; next_status text := outcome->>'status';
begin
  select * into runtime from private.browser_agent_runtime where run_id = target_run for update;
  if not found or runtime.lease_id is distinct from lease or runtime.lease_until < now() then raise exception 'Browser step lease expired'; end if;
  select * into run from public.browser_agent_runs where id = target_run for update;
  if next_status is not null and next_status not in ('running','waiting_for_human','paused','succeeded','failed','cancelled') then raise exception 'Invalid run status'; end if;
  update public.browser_agent_runs set
    status = coalesce(next_status, status),
    model = case when outcome->>'model' in ('muse-wonder-1.0','muse-spark-1.3') then outcome->>'model' else model end,
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
notify pgrst, 'reload schema';
commit;
