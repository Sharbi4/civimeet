begin;
alter table public.platform_agents drop constraint platform_agents_platform_check;
alter table public.platform_agents add constraint platform_agents_platform_check check(platform in ('web','x','eventbrite','facebook','reddit','nextdoor','instagram'));
alter table public.platform_agents add column selected boolean not null default false;
-- Preserve existing worker access where an administrator already issued a credential.
update public.platform_agents a set selected=true where platform='web' or exists(select 1 from private.agent_credentials c where c.agent_id=a.id);
insert into public.platform_agents(organization_id,platform,name)
select id,'eventbrite','Eventbrite Community Steward' from public.organizations on conflict(organization_id,platform) do nothing;
alter table public.vendor_links drop constraint vendor_links_platform_check;
alter table public.vendor_links add constraint vendor_links_platform_check check(platform in ('website','eventbrite','facebook','instagram','nextdoor','reddit','x','other'));

create or replace function public.create_vendor_workspace(workspace_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare org uuid; platform_name text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into public.organizations(name,created_by) values(btrim(workspace_name),auth.uid()) returning id into org;
  insert into public.organization_members values(org,auth.uid(),'owner');
  foreach platform_name in array array['web','x','eventbrite','facebook','reddit','nextdoor','instagram'] loop
    insert into public.platform_agents(organization_id,platform,name,selected)
      values(org,platform_name,initcap(platform_name)||' Community Steward',platform_name='web');
  end loop;
  return org;
end; $$;

create function public.select_organization_platform(target_agent uuid, is_selected boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare agent public.platform_agents;
begin
  select * into agent from public.platform_agents where id=target_agent for update;
  if not found or not private.is_admin(agent.organization_id) then raise exception 'Organization administrator access required'; end if;
  if is_selected is null then raise exception 'Select or deselect the platform'; end if;
  if agent.platform='web' then raise exception 'Use pause settings for public web research'; end if;
  update public.platform_agents set selected=is_selected where id=target_agent;
  if not is_selected then
    delete from private.agent_credentials where agent_id=target_agent;
    update public.agent_work_items set status='failed',result='Platform deselected by organization administrator.',lease_id=null,lease_until=null,updated_at=now()
      where agent_id=target_agent and status in ('queued','running');
  end if;
  insert into public.vendor_activity(organization_id,actor_id,action)
    values(agent.organization_id,auth.uid(),case when is_selected then 'platform_selected' else 'platform_deselected' end);
end; $$;
revoke all on function public.select_organization_platform(uuid,boolean) from public,anon,authenticated;
grant execute on function public.select_organization_platform(uuid,boolean) to authenticated;

create or replace function private.resolve_agent(token text) returns public.platform_agents
language plpgsql security definer set search_path = '' as $$
declare agent public.platform_agents;
begin
  if length(coalesce(token,'')) not between 32 and 256 then raise exception 'Invalid agent credential'; end if;
  select a.* into agent from private.agent_credentials c join public.platform_agents a on a.id=c.agent_id
    where c.token_hash=sha256(convert_to(token,'UTF8')) and not a.paused and a.selected;
  if not found then raise exception 'Invalid, unselected or paused agent credential'; end if;
  return agent;
end; $$;
create or replace function public.collect_agent_vendor(agent_token text, discovery jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare agent public.platform_agents;
begin
  agent:=private.resolve_agent(agent_token);
  return private.collect_vendor(agent.organization_id,agent.id,discovery,null,'agent');
end; $$;
create or replace function private.collect_vendor(org uuid, agent uuid, data jsonb, actor uuid, via text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare vendor uuid; existing_ids uuid[]; link jsonb; replay public.vendor_discoveries; requested_vendor uuid;
  source text; request_key uuid; details jsonb; discovery uuid; possible_duplicates uuid[];
begin
  if jsonb_typeof(data) is distinct from 'object' or octet_length(data::text)>40000 then raise exception 'Invalid discovery'; end if;
  details := data->'details';
  perform private.validate_vendor_details(details);
  source := data->>'source_url'; request_key := (data->>'idempotency_key')::uuid;
  requested_vendor := nullif(data->>'vendor_id','')::uuid;
  if request_key is null or source is null or source !~ '^https?://[^[:space:]@]+$' or length(source)>2048
    or length(coalesce(data->>'source_excerpt',''))>4000 or jsonb_typeof(data->'links') is distinct from 'array'
    or jsonb_array_length(data->'links')>12 then raise exception 'Provide a public source URL, request ID, and up to 12 business links'; end if;
  -- Serialize identity matching and insertions per tenant, including simultaneous agents.
  perform pg_advisory_xact_lock(hashtextextended(org::text,0));
  select * into replay from public.vendor_discoveries where agent_id=agent and idempotency_key=request_key;
  if found then return jsonb_build_object('vendor_id',replay.vendor_id,'discovery_id',replay.id,'replayed',true,'possible_duplicate_ids','[]'::jsonb); end if;
  for link in select * from jsonb_array_elements(data->'links') loop
    if coalesce(link->>'url','') !~ '^https?://[^[:space:]@]+$' or length(link->>'url')>2048
      or coalesce(link->>'platform','') not in ('website','eventbrite','facebook','instagram','nextdoor','reddit','x','other') then raise exception 'Invalid business link'; end if;
  end loop;
  select array_agg(distinct vl.vendor_id) into existing_ids from public.vendor_links vl
    where vl.organization_id=org and vl.identity_key in (select private.url_identity(x->>'url') from jsonb_array_elements(data->'links') x);
  if cardinality(existing_ids)>1 then raise exception 'These links belong to different vendors. Review the records before combining them.'; end if;
  vendor := coalesce(requested_vendor,existing_ids[1]);
  if requested_vendor is not null and existing_ids[1] is not null and requested_vendor<>existing_ids[1] then raise exception 'A business link already belongs to another vendor'; end if;
  if vendor is not null and not exists(select 1 from public.vendors where id=vendor and organization_id=org) then raise exception 'Vendor is not in this organization'; end if;
  if vendor is null then
    select array_agg(id) into possible_duplicates from public.vendors where organization_id=org and lower(btrim(name))=lower(btrim(details->>'name'));
    insert into public.vendors(organization_id,name,category,service_areas,contact_name,email,phone,notes)
      values(org,btrim(details->>'name'),coalesce(details->>'category',''),array(select jsonb_array_elements_text(details->'service_areas')),
        coalesce(details->>'contact_name',''),coalesce(details->>'email',''),coalesce(details->>'phone',''),coalesce(details->>'notes','')) returning id into vendor;
  else
    -- A discovery never overwrites reviewed contact details. The complete new
    -- snapshot remains available for an organizer to compare and adopt.
    update public.vendors set updated_at=now(),status=case when status='archived' then status else 'needs_review' end where id=vendor;
  end if;
  for link in select * from jsonb_array_elements(data->'links') loop
    insert into public.vendor_links(organization_id,vendor_id,platform,url,identity_key)
      values(org,vendor,link->>'platform',link->>'url',private.url_identity(link->>'url')) on conflict (organization_id,identity_key) do nothing;
  end loop;
  insert into public.vendor_discoveries(organization_id,vendor_id,agent_id,source_url,source_excerpt,details,recorded_by,recorded_via,idempotency_key)
    values(org,vendor,agent,source,coalesce(data->>'source_excerpt',''),details,actor,via,request_key) returning id into discovery;
  if via='agent' then update public.platform_agents set last_collection_at=now() where id=agent; end if;
  insert into public.vendor_activity(organization_id,vendor_id,actor_id,action) values(org,vendor,actor,'discovery_saved');
  return jsonb_build_object('vendor_id',vendor,'discovery_id',discovery,'replayed',false,'possible_duplicate_ids',to_jsonb(coalesce(possible_duplicates,'{}'::uuid[])));
end; $$;
create or replace function public.rotate_platform_agent_token(target_agent uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare org uuid; token text;
begin
  select organization_id into org from public.platform_agents where id=target_agent and selected for update;
  if org is null or not private.is_admin(org) then raise exception 'Organization administrator access required'; end if;
  token := replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into private.agent_credentials(agent_id,token_hash) values(target_agent,sha256(convert_to(token,'UTF8')))
    on conflict(agent_id) do update set token_hash=excluded.token_hash,created_at=now();
  insert into public.vendor_activity(organization_id,actor_id,action) values(org,auth.uid(),'agent_credential_rotated');
  return token;
end; $$;
create or replace function public.enqueue_agent_work(target_agent uuid, task_objective text, scheduled_for timestamptz default now()) returns uuid
language plpgsql security definer set search_path = '' as $$
declare org uuid; task uuid;
begin
  select organization_id into org from public.platform_agents where id=target_agent and selected and not paused for update;
  if org is null or not private.can_edit(org) then raise exception 'Organization editor access required'; end if;
  insert into public.agent_work_items(organization_id,agent_id,objective,due_at,created_by)
    values(org,target_agent,task_objective,coalesce(scheduled_for,now()),auth.uid()) returning id into task;
  return task;
end; $$;
notify pgrst, 'reload schema';
commit;
