begin;
alter table public.agent_work_items add column event_id uuid, add column skill_id text not null default 'auto' check(skill_id in ('auto','community_presence','local_partner_discovery')), add column research_request_id uuid not null default gen_random_uuid(), add column predecessor_id uuid;
alter table public.agent_work_items add constraint agent_work_org_id unique(organization_id,id), add constraint agent_work_event foreign key(organization_id,event_id) references public.community_events(organization_id,id), add constraint agent_work_predecessor foreign key(organization_id,predecessor_id) references public.agent_work_items(organization_id,id);
create unique index agent_event_active_skill on public.agent_work_items(event_id,skill_id) where event_id is not null and status in ('queued','running');

create function public.queue_event_groundwork(target_event uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare ev public.community_events; ag public.platform_agents; first_id uuid; second_id uuid;
begin
 select * into ev from public.community_events where id=target_event for update;
 if not found or not private.can_edit(ev.organization_id) then raise exception 'Organization editor access required'; end if;
 if ev.status not in ('draft','approved') or length(btrim(ev.geographic_area))<3 then raise exception 'Choose an active event with a community area'; end if;
 if not exists(select 1 from public.organization_briefs where organization_id=ev.organization_id and length(btrim(mission))>0) then raise exception 'Add your community mission in Identity first'; end if;
 select * into ag from public.platform_agents where organization_id=ev.organization_id and platform='web' and selected and not paused;
 if not found then raise exception 'Select and unpause the public web agent first'; end if;
 if exists(select 1 from public.agent_work_items where event_id=ev.id and status in ('queued','running')) then
  return (select jsonb_agg(id order by created_at,id) from public.agent_work_items where event_id=ev.id and status in ('queued','running'));
 end if;
 insert into public.agent_work_items(organization_id,agent_id,event_id,skill_id,objective,created_by)
 values(ev.organization_id,ag.id,ev.id,'community_presence','Build a helpful community presence for this event. Research relevant public local communities, explain their mission fit and prepare useful contributions for review. Do not join groups or publish.',auth.uid()) returning id into first_id;
 insert into public.agent_work_items(organization_id,agent_id,event_id,skill_id,predecessor_id,objective,created_by)
 values(ev.organization_id,ag.id,ev.id,'local_partner_discovery',first_id,'Find local vendors and partners serving the saved event area. Use our previous community research and vendor memory. Save sourced public business candidates and draft a practical gathering proposal. Do not contact or book anyone.',auth.uid()) returning id into second_id;
 insert into public.vendor_activity(organization_id,actor_id,action) values(ev.organization_id,auth.uid(),'event_groundwork_queued');
 return jsonb_build_array(first_id,second_id);
end; $$;

create function public.claim_editor_agent_work(actor uuid,workspace uuid,target_task uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare task public.agent_work_items; ag public.platform_agents;
begin
 if not exists(select 1 from public.organization_members where organization_id=workspace and user_id=actor and role in ('owner','admin','organizer')) then raise exception 'Editor access required'; end if;
 select * into task from public.agent_work_items where id=target_task and organization_id=workspace;
 if not found then raise exception 'Task not found'; end if;
 perform pg_advisory_xact_lock(hashtextextended(task.agent_id::text,1));
 select * into task from public.agent_work_items where id=target_task and organization_id=workspace for update;
 select * into ag from public.platform_agents where id=task.agent_id and organization_id=workspace;
 if not ag.selected or ag.paused then raise exception 'Agent is paused or not selected'; end if;
 if task.status='completed' then return jsonb_build_object('replayed',true,'task',to_jsonb(task)); end if;
 if task.due_at>now() then raise exception 'Task is scheduled for later'; end if;
 if task.predecessor_id is not null and not exists(select 1 from public.agent_work_items where id=task.predecessor_id and organization_id=workspace and status='completed') then raise exception 'Finish the preceding research task first'; end if;
 if exists(select 1 from public.agent_work_items where agent_id=ag.id and status='running' and lease_until>now()) then raise exception 'Agent already has work in progress'; end if;
 if task.status not in ('queued','running') then raise exception 'Task needs review; automatic retry is not available'; end if;
 if task.attempts>=3 then
  update public.agent_work_items set status='failed',result='Worker recovery limit reached. Review and explicitly retry.',lease_id=null,lease_until=null,updated_at=now() where id=task.id returning * into task;
  return jsonb_build_object('replayed',true,'task',to_jsonb(task));
 end if;
 update public.agent_work_items set status='running',lease_id=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=attempts+1,updated_at=now() where id=task.id returning * into task;
 return jsonb_build_object('replayed',false,'task',to_jsonb(task));
end; $$;

create function public.finish_editor_agent_work(actor uuid,workspace uuid,target_task uuid,task_lease uuid,succeeded boolean,outcome text) returns void language plpgsql security definer set search_path='' as $$
declare task public.agent_work_items;
begin
 if not exists(select 1 from public.organization_members where organization_id=workspace and user_id=actor and role in ('owner','admin','organizer')) then raise exception 'Editor access revoked'; end if;
 update public.agent_work_items set status=case when succeeded then 'completed' else 'failed' end,result=left(outcome,12000),lease_id=null,lease_until=null,updated_at=now()
 where id=target_task and organization_id=workspace and status='running' and lease_id=task_lease and lease_until>now() returning * into task;
 if not found then raise exception 'Task lease changed; refresh task status'; end if;
 insert into public.agent_memory(organization_id,agent_id,memory_key,kind,content)
 values(workspace,task.agent_id,'work:'||task.id,'checkpoint',left(outcome,12000))
 on conflict(agent_id,memory_key) do update set content=excluded.content,updated_at=now();
 insert into public.vendor_activity(organization_id,actor_id,action) values(workspace,actor,case when succeeded then 'agent_work_completed' else 'agent_work_failed' end);
end; $$;
revoke all on function public.queue_event_groundwork(uuid),public.claim_editor_agent_work(uuid,uuid,uuid),public.finish_editor_agent_work(uuid,uuid,uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.queue_event_groundwork(uuid) to authenticated;
grant execute on function public.claim_editor_agent_work(uuid,uuid,uuid),public.finish_editor_agent_work(uuid,uuid,uuid,uuid,boolean,text) to service_role;
create function public.retry_agent_research(target_task uuid) returns void language plpgsql security definer set search_path='' as $$
declare task public.agent_work_items;
begin
 select * into task from public.agent_work_items where id=target_task for update;
 if not found or not private.can_edit(task.organization_id) then raise exception 'Editor access required'; end if;
 if task.status<>'failed' then raise exception 'Only a failed task can be retried'; end if;
 update public.agent_work_items set status='queued',attempts=0,research_request_id=gen_random_uuid(),lease_id=null,lease_until=null,result='',updated_at=now() where id=task.id;
 insert into public.vendor_activity(organization_id,actor_id,action) values(task.organization_id,auth.uid(),'agent_work_retry_requested');
end; $$;
revoke all on function public.retry_agent_research(uuid) from public,anon;
grant execute on function public.retry_agent_research(uuid) to authenticated;
create or replace function public.claim_agent_work(agent_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare agent public.platform_agents; task public.agent_work_items;
begin
  agent:=private.resolve_agent(agent_token);
  -- Only one live lease per agent, even if several workers attempt to claim.
  perform pg_advisory_xact_lock(hashtextextended(agent.id::text,1));
  if exists(select 1 from public.agent_work_items where agent_id=agent.id and status='running' and lease_until>now()) then return null; end if;
  update public.agent_work_items set status='failed',result='Worker lease expired after three attempts.',updated_at=now(),lease_id=null,lease_until=null
    where agent_id=agent.id and status='running' and lease_until<=now() and attempts>=3;
  select * into task from public.agent_work_items where agent_id=agent.id and due_at<=now() and (predecessor_id is null or exists(select 1 from public.agent_work_items prior where prior.id=public.agent_work_items.predecessor_id and prior.status='completed'))
    and (status='queued' or (status='running' and lease_until<=now() and attempts<3))
    order by due_at,created_at,id for update skip locked limit 1;
  if not found then return null; end if;
  update public.agent_work_items set status='running',lease_id=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=attempts+1,updated_at=now()
    where id=task.id returning * into task;
  return to_jsonb(task);
end; $$;


notify pgrst,'reload schema';
commit;
