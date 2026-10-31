begin;
create table public.community_events (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 plan_id uuid, title text not null check(length(btrim(title)) between 3 and 200), purpose text not null check(length(btrim(purpose)) between 10 and 4000),
 event_date date not null, venue text not null default '' check(length(venue)<=500), budget_cents bigint not null check(budget_cents between 0 and 100000000),
 status text not null default 'draft' check(status in ('draft','approved','completed','cancelled')), revision integer not null default 1,
 approved_by uuid references auth.users(id), approved_at timestamptz, outcome text not null default '' check(length(outcome)<=4000),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,plan_id) references public.steward_plans(organization_id,id), unique(organization_id,id)
);
create table public.event_payment_requests (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, event_id uuid not null, vendor_id uuid not null,
 description text not null check(length(btrim(description)) between 3 and 1000), amount_cents bigint not null check(amount_cents between 1 and 100000000),
 currency text not null default 'usd' check(currency='usd'), quote_url text not null check(length(quote_url)<=2048 and quote_url ~ '^https?://[^[:space:]@]+$'),
 status text not null default 'proposed' check(status in ('proposed','approved','rejected')),
 event_revision integer not null, approved_by uuid references auth.users(id), approved_at timestamptz,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 foreign key(organization_id,event_id) references public.community_events(organization_id,id),
 foreign key(organization_id,vendor_id) references public.vendors(organization_id,id)
);
create index community_events_scope on public.community_events(organization_id,event_date);
create index event_payment_requests_scope on public.event_payment_requests(organization_id,event_id,status);
alter table public.community_events enable row level security;
alter table public.event_payment_requests enable row level security;
create policy member_read on public.community_events for select to authenticated using(private.is_member(organization_id));
create policy member_read on public.event_payment_requests for select to authenticated using(private.is_member(organization_id));
revoke all on public.community_events,public.event_payment_requests from public,anon,authenticated;
grant select on public.community_events,public.event_payment_requests to authenticated;
grant all on public.community_events,public.event_payment_requests to service_role;

create function public.save_community_event(workspace uuid, event_data jsonb, target_event uuid default null, expected_revision integer default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare item uuid; old public.community_events;
begin
 if not private.can_edit(workspace) then raise exception 'Organization editor access required'; end if;
 if target_event is null then
  insert into public.community_events(organization_id,plan_id,title,purpose,event_date,venue,budget_cents,created_by)
  values(workspace,nullif(event_data->>'plan_id','')::uuid,btrim(event_data->>'title'),event_data->>'purpose',(event_data->>'event_date')::date,coalesce(event_data->>'venue',''),(event_data->>'budget_cents')::bigint,auth.uid()) returning id into item;
 else
  select * into old from public.community_events where id=target_event and organization_id=workspace for update;
  if not found or old.revision is distinct from expected_revision or old.status in ('completed','cancelled') then raise exception 'Event changed or is closed. Refresh before editing.'; end if;
  update public.community_events set plan_id=nullif(event_data->>'plan_id','')::uuid,title=btrim(event_data->>'title'),purpose=event_data->>'purpose',event_date=(event_data->>'event_date')::date,venue=coalesce(event_data->>'venue',''),budget_cents=(event_data->>'budget_cents')::bigint,revision=revision+1,status='draft',approved_at=null,approved_by=null,updated_at=now() where id=target_event;
  update public.event_payment_requests set status='rejected',approved_at=null,approved_by=null where event_id=target_event and status in ('proposed','approved');
  item:=target_event;
 end if;
 insert into public.vendor_activity(organization_id,actor_id,action) values(workspace,auth.uid(),'community_event_planned');
 return item;
end; $$;
create function public.review_community_event(target_event uuid, expected_revision integer, decision text, result_note text default '') returns void
language plpgsql security definer set search_path='' as $$
declare event public.community_events;
begin
 select * into event from public.community_events where id=target_event for update;
 if not found or not private.is_admin(event.organization_id) then raise exception 'Organization administrator access required'; end if;
 if event.revision is distinct from expected_revision then raise exception 'Event changed. Review the latest plan.'; end if;
 if decision='approve' and event.status='draft' then
  update public.community_events set status='approved',approved_by=auth.uid(),approved_at=now(),updated_at=now() where id=target_event;
 elsif decision='complete' and event.status='approved' and length(btrim(result_note)) between 10 and 4000 then
  update public.community_events set status='completed',outcome=result_note,updated_at=now() where id=target_event;
 elsif decision='cancel' and event.status in ('draft','approved') then
  update public.community_events set status='cancelled',updated_at=now() where id=target_event;
  update public.event_payment_requests set status='rejected',approved_by=null,approved_at=null where event_id=target_event and status in ('proposed','approved');
 else raise exception 'Invalid event transition or missing outcome'; end if;
 insert into public.vendor_activity(organization_id,actor_id,action) values(event.organization_id,auth.uid(),'community_event_'||decision);
end; $$;
create function public.propose_event_payment(target_event uuid, target_vendor uuid, payment_description text, amount bigint, quote_source text) returns uuid
language plpgsql security definer set search_path='' as $$
declare event public.community_events; item uuid;
begin
 select * into event from public.community_events where id=target_event for update;
 if not found or not private.can_edit(event.organization_id) then raise exception 'Organization editor access required'; end if;
 if event.status not in ('draft','approved') then raise exception 'Event is closed'; end if;
 if not exists(select 1 from public.vendors where id=target_vendor and organization_id=event.organization_id and status<>'archived') then raise exception 'Choose an active vendor from this organization'; end if;
 insert into public.event_payment_requests(organization_id,event_id,vendor_id,description,amount_cents,quote_url,event_revision,created_by)
 values(event.organization_id,target_event,target_vendor,payment_description,amount,quote_source,event.revision,auth.uid()) returning id into item;
 insert into public.vendor_activity(organization_id,vendor_id,actor_id,action) values(event.organization_id,target_vendor,auth.uid(),'event_payment_proposed');
 return item;
end; $$;
create function public.review_event_payment(target_payment uuid, decision text) returns void
language plpgsql security definer set search_path='' as $$
declare proposal public.event_payment_requests; event public.community_events; event_key uuid; committed bigint;
begin
 select event_id into event_key from public.event_payment_requests where id=target_payment;
 -- Lock event before proposal, matching event edits and concurrent budget reviews.
 select * into event from public.community_events where id=event_key for update;
 if not found or not private.is_admin(event.organization_id) then raise exception 'Organization administrator access required'; end if;
 select * into proposal from public.event_payment_requests where id=target_payment for update;
 if decision='approve' and proposal.status='proposed' and event.status='approved' and proposal.event_revision=event.revision then
  select coalesce(sum(amount_cents),0) into committed from public.event_payment_requests where event_id=event.id and status='approved';
  if committed+proposal.amount_cents>event.budget_cents then raise exception 'This approval would exceed the event budget'; end if;
  update public.event_payment_requests set status='approved',approved_by=auth.uid(),approved_at=now() where id=target_payment;
 elsif decision='reject' and proposal.status in ('proposed','approved') then
  update public.event_payment_requests set status='rejected',approved_by=null,approved_at=null where id=target_payment;
 else raise exception 'Approve the current event plan before approving this payment'; end if;
 insert into public.vendor_activity(organization_id,vendor_id,actor_id,action) values(event.organization_id,proposal.vendor_id,auth.uid(),'event_payment_'||decision);
end; $$;
revoke all on function public.save_community_event(uuid,jsonb,uuid,integer),public.review_community_event(uuid,integer,text,text),public.propose_event_payment(uuid,uuid,text,bigint,text),public.review_event_payment(uuid,text) from public,anon,authenticated;
grant execute on function public.save_community_event(uuid,jsonb,uuid,integer),public.review_community_event(uuid,integer,text,text),public.propose_event_payment(uuid,uuid,text,bigint,text),public.review_event_payment(uuid,text) to authenticated;
notify pgrst, 'reload schema';
commit;
