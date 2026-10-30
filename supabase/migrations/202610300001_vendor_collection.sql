-- Organization-owned vendor memory and platform-specific collection identities.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 160),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','organizer','viewer')),
  primary key (organization_id, user_id)
);
create index organization_members_user on public.organization_members(user_id);
create table public.platform_agents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  platform text not null check (platform in ('web','facebook','instagram','nextdoor','reddit','x')),
  name text not null check (length(name) between 2 and 160),
  instructions text not null default 'Collect publicly shared business details useful for community gatherings. Preserve sources and uncertainty. Do not contact or book vendors.' check (length(instructions) <= 4000),
  paused boolean not null default false,
  last_collection_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, platform),
  unique (organization_id, id)
);
create table private.agent_credentials (
  agent_id uuid primary key references public.platform_agents(id) on delete cascade,
  token_hash bytea not null unique,
  created_at timestamptz not null default now()
);
create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 200),
  category text not null default '' check (length(category) <= 100),
  service_areas text[] not null default '{}' check (cardinality(service_areas) <= 20),
  contact_name text not null default '' check (length(contact_name) <= 160),
  email text not null default '' check (length(email) <= 254),
  phone text not null default '' check (length(phone) <= 60),
  notes text not null default '' check (length(notes) <= 4000),
  status text not null default 'needs_review' check (status in ('needs_review','verified','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  verified_at timestamptz,
  verified_by uuid references auth.users(id),
  unique (organization_id, id)
);
create index vendors_org_status on public.vendors(organization_id,status);
create index vendors_org_name on public.vendors(organization_id,lower(name));
create table public.vendor_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  vendor_id uuid not null,
  platform text not null check (platform in ('website','facebook','instagram','nextdoor','reddit','x','other')),
  url text not null check (length(url) <= 2048 and url ~ '^https?://[^[:space:]@]+$'),
  identity_key text not null,
  foreign key (organization_id,vendor_id) references public.vendors(organization_id,id) on delete cascade,
  unique (organization_id,identity_key)
);
create table public.vendor_discoveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  vendor_id uuid not null,
  agent_id uuid not null,
  source_url text not null check (length(source_url) <= 2048 and source_url ~ '^https?://[^[:space:]@]+$'),
  source_excerpt text not null default '' check (length(source_excerpt) <= 4000),
  details jsonb not null,
  recorded_by uuid references auth.users(id),
  recorded_via text not null check (recorded_via in ('organizer','agent')),
  discovered_at timestamptz not null default now(),
  idempotency_key uuid not null,
  foreign key (organization_id,vendor_id) references public.vendors(organization_id,id) on delete cascade,
  foreign key (organization_id,agent_id) references public.platform_agents(organization_id,id),
  unique (agent_id,idempotency_key)
);
create index vendor_discoveries_vendor on public.vendor_discoveries(organization_id,vendor_id,discovered_at desc);
create table public.vendor_activity (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  vendor_id uuid,
  actor_id uuid references auth.users(id),
  action text not null,
  created_at timestamptz not null default now(),
  foreign key (organization_id,vendor_id) references public.vendors(organization_id,id)
);

create function private.is_member(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.organization_members m where m.organization_id=org and m.user_id=auth.uid());
$$;
create function private.can_edit(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.organization_members m where m.organization_id=org and m.user_id=auth.uid() and m.role in ('owner','admin','organizer'));
$$;
create function private.is_admin(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.organization_members m where m.organization_id=org and m.user_id=auth.uid() and m.role in ('owner','admin'));
$$;
grant usage on schema private to authenticated;
grant execute on function private.is_member(uuid), private.can_edit(uuid), private.is_admin(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.platform_agents enable row level security;
alter table public.vendors enable row level security;
alter table public.vendor_links enable row level security;
alter table public.vendor_discoveries enable row level security;
alter table public.vendor_activity enable row level security;
create policy member_read on public.organizations for select to authenticated using (private.is_member(id));
create policy member_read on public.organization_members for select to authenticated using (private.is_member(organization_id));
create policy member_read on public.platform_agents for select to authenticated using (private.is_member(organization_id));
create policy member_read on public.vendors for select to authenticated using (private.is_member(organization_id));
create policy member_read on public.vendor_links for select to authenticated using (private.is_member(organization_id));
create policy member_read on public.vendor_discoveries for select to authenticated using (private.is_member(organization_id));
create policy member_read on public.vendor_activity for select to authenticated using (private.is_member(organization_id));
revoke all on public.organizations,public.organization_members,public.platform_agents,public.vendors,public.vendor_links,public.vendor_discoveries,public.vendor_activity from anon,authenticated;
grant select on public.organizations,public.organization_members,public.platform_agents,public.vendors,public.vendor_links,public.vendor_discoveries,public.vendor_activity to authenticated;

create function public.create_vendor_workspace(workspace_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare org uuid; platform_name text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into public.organizations(name,created_by) values(btrim(workspace_name),auth.uid()) returning id into org;
  insert into public.organization_members values(org,auth.uid(),'owner');
  foreach platform_name in array array['web','facebook','instagram','nextdoor','reddit','x'] loop
    insert into public.platform_agents(organization_id,platform,name) values(org,platform_name,initcap(platform_name)||' Community Steward');
  end loop;
  return org;
end; $$;

-- URL identity uses a lowercase host but preserves case-sensitive paths and query
-- strings (including Facebook profile.php?id=...). Evidence article URLs are not identities.
create function private.url_identity(value text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(lower(substring(value from '^https?://[^/?#]+')), '^https?://(www\.)?', '') ||
    regexp_replace(split_part(regexp_replace(value, '^https?://[^/?#]+', ''),'#',1),'/$','');
$$;
create function private.validate_vendor_details(details jsonb) returns void
language plpgsql set search_path = '' as $$
begin
  if jsonb_typeof(details) is distinct from 'object' or octet_length(details::text)>24000
    or length(btrim(coalesce(details->>'name',''))) not between 2 and 200
    or length(coalesce(details->>'category',''))>100
    or length(coalesce(details->>'contact_name',''))>160
    or length(coalesce(details->>'email',''))>254
    or length(coalesce(details->>'phone',''))>60
    or length(coalesce(details->>'notes',''))>4000
    or jsonb_typeof(details->'service_areas') is distinct from 'array'
    or jsonb_array_length(details->'service_areas')>20 then raise exception 'Invalid vendor details'; end if;
  if exists(select 1 from jsonb_array_elements(details->'service_areas') a where jsonb_typeof(a) <> 'string' or length(a#>>'{}') not between 1 and 160) then raise exception 'Invalid service area'; end if;
  if coalesce(details->>'email','')<>'' and (details->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid business email'; end if;
end; $$;

create function private.collect_vendor(org uuid, agent uuid, data jsonb, actor uuid, via text) returns jsonb
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
      or coalesce(link->>'platform','') not in ('website','facebook','instagram','nextdoor','reddit','x','other') then raise exception 'Invalid business link'; end if;
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

create function public.save_vendor_discovery(agent_id uuid, discovery jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare org uuid;
begin
  select organization_id into org from public.platform_agents where id=agent_id;
  if org is null or not private.can_edit(org) then raise exception 'Organization editor access required'; end if;
  return private.collect_vendor(org,agent_id,discovery,auth.uid(),'organizer');
end; $$;

create function public.collect_agent_vendor(agent_token text, discovery jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare agent public.platform_agents;
begin
  if length(coalesce(agent_token,'')) not between 32 and 256 then raise exception 'Invalid agent credential'; end if;
  select a.* into agent from private.agent_credentials c join public.platform_agents a on a.id=c.agent_id
    where c.token_hash=sha256(convert_to(agent_token,'UTF8')) and not a.paused;
  if not found then raise exception 'Invalid or paused agent credential'; end if;
  return private.collect_vendor(agent.organization_id,agent.id,discovery,null,'agent');
end; $$;

create function public.rotate_platform_agent_token(target_agent uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare org uuid; token text;
begin
  select organization_id into org from public.platform_agents where id=target_agent;
  if org is null or not private.is_admin(org) then raise exception 'Organization administrator access required'; end if;
  token := replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into private.agent_credentials(agent_id,token_hash) values(target_agent,sha256(convert_to(token,'UTF8')))
    on conflict(agent_id) do update set token_hash=excluded.token_hash,created_at=now();
  insert into public.vendor_activity(organization_id,actor_id,action) values(org,auth.uid(),'agent_credential_rotated');
  return token;
end; $$;

create function public.configure_platform_agent(target_agent uuid, agent_name text, agent_instructions text, is_paused boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare org uuid;
begin
  select organization_id into org from public.platform_agents where id=target_agent;
  if org is null or not private.is_admin(org) then raise exception 'Organization administrator access required'; end if;
  update public.platform_agents set name=btrim(agent_name),instructions=agent_instructions,paused=is_paused where id=target_agent;
  insert into public.vendor_activity(organization_id,actor_id,action) values(org,auth.uid(),'agent_configured');
end; $$;

create function public.review_vendor(target_vendor uuid, details jsonb, review_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare org uuid;
begin
  select organization_id into org from public.vendors where id=target_vendor;
  if org is null or not private.can_edit(org) then raise exception 'Organization editor access required'; end if;
  perform private.validate_vendor_details(details);
  if review_status is null or review_status not in ('needs_review','verified','archived') then raise exception 'Invalid review status'; end if;
  update public.vendors set name=btrim(details->>'name'),category=coalesce(details->>'category',''),
    service_areas=array(select jsonb_array_elements_text(details->'service_areas')),contact_name=coalesce(details->>'contact_name',''),
    email=coalesce(details->>'email',''),phone=coalesce(details->>'phone',''),notes=coalesce(details->>'notes',''),status=review_status,
    updated_at=now(),verified_at=case when review_status='verified' then now() else null end,
    verified_by=case when review_status='verified' then auth.uid() else null end where id=target_vendor;
  insert into public.vendor_activity(organization_id,vendor_id,actor_id,action) values(org,target_vendor,auth.uid(),'vendor_'||review_status);
end; $$;

-- Functions have PUBLIC execute by default: explicitly narrow every boundary.
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.is_member(uuid),private.can_edit(uuid),private.is_admin(uuid) to authenticated;
revoke all on function public.create_vendor_workspace(text),public.save_vendor_discovery(uuid,jsonb),public.collect_agent_vendor(text,jsonb),public.rotate_platform_agent_token(uuid),public.configure_platform_agent(uuid,text,text,boolean),public.review_vendor(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.create_vendor_workspace(text),public.save_vendor_discovery(uuid,jsonb),public.rotate_platform_agent_token(uuid),public.configure_platform_agent(uuid,text,text,boolean),public.review_vendor(uuid,jsonb,text) to authenticated;
grant execute on function public.collect_agent_vendor(text,jsonb) to anon,authenticated;
notify pgrst, 'reload schema';
commit;
