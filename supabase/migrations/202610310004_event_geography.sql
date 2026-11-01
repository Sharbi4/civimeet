begin;
alter table public.community_events add column geographic_area text not null default '' check(length(geographic_area)<=160);
comment on column public.community_events.geographic_area is 'Event research area, independent of organization home area or account address.';
create or replace function public.save_community_event(workspace uuid, event_data jsonb, target_event uuid default null, expected_revision integer default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare item uuid; old public.community_events;
begin
 if not private.can_edit(workspace) then raise exception 'Organization editor access required'; end if;
 if target_event is null then
  insert into public.community_events(organization_id,plan_id,title,purpose,event_date,venue,geographic_area,budget_cents,created_by)
  values(workspace,nullif(event_data->>'plan_id','')::uuid,btrim(event_data->>'title'),event_data->>'purpose',(event_data->>'event_date')::date,coalesce(event_data->>'venue',''),btrim(coalesce(event_data->>'geographic_area','')),(event_data->>'budget_cents')::bigint,auth.uid()) returning id into item;
 else
  select * into old from public.community_events where id=target_event and organization_id=workspace for update;
  if not found or old.revision is distinct from expected_revision or old.status in ('completed','cancelled') then raise exception 'Event changed or is closed. Refresh before editing.'; end if;
  update public.community_events set plan_id=nullif(event_data->>'plan_id','')::uuid,title=btrim(event_data->>'title'),purpose=event_data->>'purpose',event_date=(event_data->>'event_date')::date,venue=coalesce(event_data->>'venue',''),geographic_area=btrim(coalesce(event_data->>'geographic_area',old.geographic_area)),budget_cents=(event_data->>'budget_cents')::bigint,revision=revision+1,status='draft',approved_at=null,approved_by=null,updated_at=now() where id=target_event;
  update public.event_payment_requests set status='rejected',approved_at=null,approved_by=null where event_id=target_event and status in ('proposed','approved');
  item:=target_event;
 end if;
 insert into public.vendor_activity(organization_id,actor_id,action) values(workspace,auth.uid(),'community_event_planned');
 return item;
end; $$;

notify pgrst, 'reload schema';
commit;
