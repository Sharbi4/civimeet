-- Conversational replies ("Where are you thinking?") stay in the chat history and agent memory;
-- only research results are copied into the organization's shared knowledge.
begin;
create or replace function public.finish_steward_research(target_run uuid, research_result jsonb default null, failure text default null) returns void
language plpgsql security definer set search_path='' as $$
declare run public.steward_research_runs;
begin
 select * into run from public.steward_research_runs where id=target_run for update;
 if not found or run.status<>'running' then raise exception 'Research run is no longer active'; end if;
 if research_result is not null then
  if length(coalesce(research_result->>'answer',''))<1 or octet_length(research_result::text)>100000 then raise exception 'Invalid research result'; end if;
  update public.steward_research_runs set status='completed',result=research_result,finished_at=now() where id=target_run;
  if coalesce(research_result->'skill'->>'id','') <> 'conversation' then
   insert into public.organization_knowledge(organization_id,title,content,source_url,created_by)
   values(run.organization_id,left('Research: '||(run.input->>'question'),200),left(research_result->>'answer',10000)||E'\nSources: '||left(coalesce((research_result->'sources')::text,'[]'),1800)||E'\nFull research record: '||run.id::text,coalesce(research_result->'sources'->0->>'url',''),run.requested_by);
  end if;
 else
  update public.steward_research_runs set status='failed',error=left(coalesce(failure,'Research could not finish.'),500),finished_at=now() where id=target_run;
 end if;
 insert into public.vendor_activity(organization_id,actor_id,action) values(run.organization_id,run.requested_by,case when research_result is null then 'steward_research_failed' when coalesce(research_result->'skill'->>'id','')='conversation' then 'organizer_replied' else 'steward_research_completed' end);
end; $$;
notify pgrst, 'reload schema';
commit;
