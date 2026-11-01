begin;
create table public.organizer_approvals (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 title text not null check(length(btrim(title)) between 3 and 200), content text not null check(length(btrim(content)) between 10 and 10000),
 destination text not null check(length(btrim(destination)) between 3 and 500), kind text not null check(kind in ('post','message','booking','payment')),
 status text not null default 'pending' check(status in ('pending','approved','rejected')), revision integer not null default 1,
 created_by uuid not null references auth.users(id), reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index organizer_approvals_scope on public.organizer_approvals(organization_id,status,created_at desc);
alter table public.organizer_approvals enable row level security;
create policy member_read on public.organizer_approvals for select to authenticated using(private.is_member(organization_id));
revoke all on public.organizer_approvals from public,anon,authenticated;
grant select on public.organizer_approvals to authenticated;
grant all on public.organizer_approvals to service_role;
create function public.save_organizer_approval(workspace uuid, draft jsonb, target uuid default null, expected_revision integer default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare item uuid; old public.organizer_approvals;
begin
 if not private.can_edit(workspace) then raise exception 'Organization editor access required'; end if;
 if target is null then
  insert into public.organizer_approvals(organization_id,title,content,destination,kind,created_by)
  values(workspace,draft->>'title',draft->>'content',draft->>'destination',draft->>'kind',auth.uid()) returning id into item;
 else
  select * into old from public.organizer_approvals where id=target and organization_id=workspace for update;
  if not found or old.revision is distinct from expected_revision then raise exception 'Draft changed. Refresh before editing.'; end if;
  update public.organizer_approvals set title=draft->>'title',content=draft->>'content',destination=draft->>'destination',kind=draft->>'kind',status='pending',revision=revision+1,reviewed_by=null,reviewed_at=null,updated_at=now() where id=target;
  item:=target;
 end if;
 insert into public.vendor_activity(organization_id,actor_id,action) values(workspace,auth.uid(),'organizer_draft_saved:'||item::text);
 return item;
end; $$;
create function public.review_organizer_approval(target uuid, expected_revision integer, decision text) returns void
language plpgsql security definer set search_path='' as $$
declare item public.organizer_approvals;
begin
 select * into item from public.organizer_approvals where id=target for update;
 if not found or not private.is_admin(item.organization_id) then raise exception 'Organization administrator access required'; end if;
 if item.revision is distinct from expected_revision or item.status<>'pending' then raise exception 'Draft changed or already reviewed. Refresh.'; end if;
 if decision not in ('approve','reject') then raise exception 'Invalid review decision'; end if;
 update public.organizer_approvals set status=case when decision='approve' then 'approved' else 'rejected' end, reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=target;
 insert into public.vendor_activity(organization_id,actor_id,action) values(item.organization_id,auth.uid(),'organizer_draft_'||decision||':'||target::text||':revision:'||expected_revision::text);
 -- A decision records consent to this exact draft only. No publication/payment is executed here.
end; $$;
revoke all on function public.save_organizer_approval(uuid,jsonb,uuid,integer),public.review_organizer_approval(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.save_organizer_approval(uuid,jsonb,uuid,integer),public.review_organizer_approval(uuid,integer,text) to authenticated;
commit;
