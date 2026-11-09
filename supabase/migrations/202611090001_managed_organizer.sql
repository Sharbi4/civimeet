begin;
create table public.organizer_sessions (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 thread text not null check(thread in ('main','venue','outreach','volunteers')),
 provider_id text unique,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 lease_id uuid,
 lease_until timestamptz,
 archived boolean not null default false,
 unique(organization_id,id)
);
create unique index organizer_current_thread on public.organizer_sessions(organization_id,thread) where not archived;
create table public.organizer_submissions (
 organization_id uuid not null,
 id uuid not null,
 session_id uuid not null,
 message text not null check(length(message) between 1 and 6000),
 created_at timestamptz not null default now(),
 primary key(organization_id,id),
 foreign key(organization_id,session_id) references public.organizer_sessions(organization_id,id) on delete cascade
);
alter table public.organizer_sessions enable row level security;
alter table public.organizer_submissions enable row level security;
revoke all on public.organizer_sessions,public.organizer_submissions from anon,authenticated;
grant select on public.organizer_sessions,public.organizer_submissions to authenticated;
create policy member_read on public.organizer_sessions for select to authenticated using(private.is_member(organization_id));
create policy member_read on public.organizer_submissions for select to authenticated using(private.is_member(organization_id));

-- Provider IDs are resolved only from the authenticated organization's row.
-- A short lease prevents two application instances from submitting overlapping turns.
create function public.reserve_organizer_turn(actor uuid,workspace uuid,chat_thread text,submission uuid,message_text text,resuming boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.organizer_sessions; previous public.organizer_submissions; replay boolean:=false;
begin
 if not exists(select 1 from public.organization_members where organization_id=workspace and user_id=actor and role in ('owner','admin','organizer')) then raise exception 'Editor access required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(workspace::text||chat_thread,9));
 select * into s from public.organizer_sessions where organization_id=workspace and thread=chat_thread and not archived for update;
 if not found then
  if resuming then raise exception 'No conversation to resume'; end if;
  insert into public.organizer_sessions(organization_id,thread,created_by) values(workspace,chat_thread,actor) returning * into s;
 end if;
 if s.lease_until>now() then raise exception 'Organizer is already responding. Wait or stop the current task.'; end if;
 if not resuming then
  select * into previous from public.organizer_submissions where organization_id=workspace and id=submission;
  if found then
   if previous.session_id<>s.id or previous.message<>message_text then raise exception 'Submission does not match'; end if;
   replay:=true;
  else
   if (select count(*) from public.organizer_submissions where organization_id=workspace and created_at>now()-interval '1 day')>=30 then raise exception 'Daily organizer limit reached'; end if;
   insert into public.organizer_submissions(organization_id,id,session_id,message) values(workspace,submission,s.id,message_text);
  end if;
 end if;
 update public.organizer_sessions set lease_id=gen_random_uuid(),lease_until=now()+interval '4 minutes' where id=s.id returning * into s;
 return jsonb_build_object('session',to_jsonb(s),'replayed',replay);
end; $$;
revoke all on function public.reserve_organizer_turn(uuid,uuid,text,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.reserve_organizer_turn(uuid,uuid,text,uuid,text,boolean) to service_role;
commit;
