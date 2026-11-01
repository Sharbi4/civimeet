begin;
-- One atomic completion: evidence, vendor candidates, proposal and research memory.
-- Only the authenticated server may invoke this function. No model-supplied tenant IDs.
create function public.finish_steward_discovery(target_run uuid, research_result jsonb, failure text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run public.steward_research_runs; agent public.platform_agents; candidate jsonb; link jsonb;
 saved integer:=0; skipped integer:=0; proposed uuid; draft jsonb; enriched jsonb;
begin
 select * into run from public.steward_research_runs where id=target_run for update;
 if not found then raise exception 'Unknown research run'; end if;
 if run.status='completed' then return run.result; end if;
 if run.status<>'running' or coalesce(run.input->>'collectVendors','false')<>'true' then raise exception 'Discovery run is not active'; end if;
 if not exists(select 1 from public.organization_members where organization_id=run.organization_id and user_id=run.requested_by and role in ('owner','admin','organizer')) then raise exception 'Editor access was revoked'; end if;
 select * into agent from public.platform_agents where id=(run.input->>'agentId')::uuid and organization_id=run.organization_id for update;
 if not found or not agent.selected or agent.paused then raise exception 'Agent is no longer active'; end if;
 if octet_length(research_result::text)>100000 or jsonb_typeof(research_result->'localDiscovery'->'vendors') is distinct from 'array' or jsonb_array_length(research_result->'localDiscovery'->'vendors')>5 then raise exception 'Invalid discovery batch'; end if;
 for candidate in select value from jsonb_array_elements(research_result->'localDiscovery'->'vendors') loop
  begin
   if not exists(select 1 from jsonb_array_elements(research_result->'sources') s where s->>'url'=candidate->>'source_url') then raise exception 'Source not in research evidence'; end if;
   for link in select value from jsonb_array_elements(candidate->'links') loop
    if not exists(select 1 from jsonb_array_elements(research_result->'sources') s where s->>'url'=link->>'url') then raise exception 'Uncited identity link'; end if;
   end loop;
   perform private.collect_vendor(run.organization_id,agent.id,candidate || jsonb_build_object('idempotency_key',gen_random_uuid()),run.requested_by,'agent');
   saved:=saved+1;
  exception when others then
   -- Reject conflicting or invalid candidates without discarding valid peers.
   skipped:=skipped+1;
  end;
 end loop;
 draft:=research_result->'localDiscovery'->'plan';
 if draft is not null and draft<>'null'::jsonb then
  insert into public.steward_plans(organization_id,title,contribution,connection,gathering,follow_up,follow_up_on,created_by)
  values(run.organization_id,draft->>'title',draft->>'contribution',coalesce(draft->>'connection',''),coalesce(draft->>'gathering',''),draft->>'follow_up',current_date+7,run.requested_by) returning id into proposed;
  insert into public.vendor_activity(organization_id,actor_id,action) values(run.organization_id,run.requested_by,'steward_discovery_plan_drafted');
 end if;
 enriched:=research_result || jsonb_build_object('savedDiscovery',jsonb_build_object('vendorCount',saved,'skippedCount',skipped,'planId',proposed));
 perform public.finish_steward_research(target_run,enriched,null);
 return enriched;
end; $$;
revoke all on function public.finish_steward_discovery(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.finish_steward_discovery(uuid,jsonb,text) to service_role;
notify pgrst, 'reload schema';
commit;
