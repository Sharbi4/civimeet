-- Conversational chat: accept short messages ("hi", "thanks") instead of requiring 10 characters.
begin;
create or replace function public.reserve_steward_research(actor uuid, workspace uuid, request_key uuid, research_input jsonb, target_plan uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare existing public.steward_research_runs; item uuid;
begin
 if not exists(select 1 from public.organization_members where organization_id=workspace and user_id=actor and role in ('owner','admin','organizer')) then raise exception 'Organization editor access required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(workspace::text,42));
 select * into existing from public.steward_research_runs where organization_id=workspace and request_id=request_key;
 if found then return jsonb_build_object('started',false,'run',to_jsonb(existing)); end if;
 if length(btrim(coalesce(research_input->>'question',''))) not between 2 and 3000 or length(coalesce(research_input->>'location',''))>160
 or coalesce(research_input->>'purpose','') not in ('resources','venues','vendors','events','general') then raise exception 'Invalid research input'; end if;
 update public.steward_research_runs set status='failed',error='The research worker stopped before saving a result. Start a new request to retry.',finished_at=now()
 where organization_id=workspace and status='running' and created_at<now()-interval '3 minutes';
 if exists(select 1 from public.steward_research_runs where organization_id=workspace and status='running') then raise exception 'Research already running for this organization'; end if;
 if (select count(*) from public.steward_research_runs where organization_id=workspace and created_at>now()-interval '24 hours')>=20 then raise exception 'Organization research limit reached (20 requests per 24 hours)'; end if;
 insert into public.steward_research_runs(organization_id,plan_id,request_id,requested_by,input) values(workspace,target_plan,request_key,actor,research_input) returning id into item;
 select * into existing from public.steward_research_runs where id=item;
 return jsonb_build_object('started',true,'run',to_jsonb(existing));
end; $$;
notify pgrst,'reload schema';
commit;
