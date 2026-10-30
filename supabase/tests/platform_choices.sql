-- Rollback-only integration test of organization platform preferences.
begin;
do $$
declare
  owner_a uuid:=gen_random_uuid(); owner_b uuid:=gen_random_uuid(); viewer uuid:=gen_random_uuid();
  org_a uuid; org_b uuid; agent_a uuid; agent_b uuid; token text; task uuid; denied boolean;
begin
  insert into auth.users(id,email) values(owner_a,'platform-a@example.invalid'),(owner_b,'platform-b@example.invalid'),(viewer,'platform-viewer@example.invalid');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_a,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  org_a:=public.create_vendor_workspace('Platform choices A');
  if (select count(*) from public.platform_agents where organization_id=org_a and platform<>'web')<>6 then raise exception 'Missing requested platform'; end if;
  if (select count(*) from public.platform_agents where organization_id=org_a and selected)<>1 then raise exception 'External platforms must be opt in'; end if;
  select id into agent_a from public.platform_agents where organization_id=org_a and platform='eventbrite';
  denied:=false;
  begin perform public.rotate_platform_agent_token(agent_a); exception when others then denied:=true; end;
  if not denied then raise exception 'Unselected platform issued credential'; end if;
  denied:=false;
  begin perform public.enqueue_agent_work(agent_a,'Find local community events'); exception when others then denied:=true; end;
  if not denied then raise exception 'Unselected platform accepted work'; end if;
  perform public.select_organization_platform(agent_a,true);
  token:=public.rotate_platform_agent_token(agent_a);
  perform public.remember_agent(token,'test','fact','Eventbrite organization memory');
  perform public.collect_agent_vendor(token,jsonb_build_object('details',jsonb_build_object('name','Event host','service_areas',jsonb_build_array('Phoenix')),
    'source_url','https://www.eventbrite.com/o/example','links',jsonb_build_array(jsonb_build_object('platform','eventbrite','url','https://www.eventbrite.com/o/example')),'idempotency_key',gen_random_uuid()));
  task:=public.enqueue_agent_work(agent_a,'Find local community events');
  perform public.claim_agent_work(token);
  perform public.select_organization_platform(agent_a,false);
  if (select status from public.agent_work_items where id=task)<>'failed' then raise exception 'Deselect did not stop pending work'; end if;
  denied:=false;
  begin perform public.recall_agent_context(token); exception when others then denied:=true; end;
  if not denied then raise exception 'Deselected credential still has access'; end if;
  if (select count(*) from public.agent_memory where agent_id=agent_a)<>1 then raise exception 'Deselect erased memory'; end if;
  perform public.select_organization_platform(agent_a,true);
  denied:=false;
  begin perform public.recall_agent_context(token); exception when others then denied:=true; end;
  if not denied then raise exception 'Reselection revived revoked token'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_b,'role','authenticated')::text,true);
  org_b:=public.create_vendor_workspace('Platform choices B');
  select id into agent_b from public.platform_agents where organization_id=org_b and platform='eventbrite';
  if (select selected from public.platform_agents where id=agent_b) then raise exception 'Organization choices leaked'; end if;
  denied:=false;
  begin perform public.select_organization_platform(agent_a,false); exception when others then denied:=true; end;
  if not denied then raise exception 'Cross-organization preference edit allowed'; end if;
  execute 'reset role';
  insert into public.organization_members values(org_a,viewer,'viewer');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',viewer,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  denied:=false;
  begin perform public.select_organization_platform(agent_a,false); exception when others then denied:=true; end;
  if not denied then raise exception 'Viewer changed connection preference'; end if;
  execute 'reset role';
end; $$;
rollback;
select 'Platform choices, Eventbrite discovery, credential revocation and organization isolation passed; fixtures rolled back.' as result;
