-- Civi's daily message allowance per organization: 30 → 100 (demo and pilot headroom).
-- Reconnecting to a running task never counts; only new messages do.
begin;
create or replace function public.reserve_organizer_turn(actor uuid,workspace uuid,chat_thread text,submission uuid,message_text text,resuming boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
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
   if (select count(*) from public.organizer_submissions where organization_id=workspace and created_at>now()-interval '1 day')>=100 then raise exception 'Daily organizer limit reached'; end if;
   insert into public.organizer_submissions(organization_id,id,session_id,message) values(workspace,submission,s.id,message_text);
  end if;
 end if;
 update public.organizer_sessions set lease_id=gen_random_uuid(),lease_until=now()+interval '4 minutes' where id=s.id returning * into s;
 return jsonb_build_object('session',to_jsonb(s),'replayed',replay);
end; $$;
notify pgrst, 'reload schema';
commit;
