-- Chat actions: instructions Civi carried out with a tool (open a platform, sign in, show the
-- browser, pause an agent ...) and their real outcome. They sit in the conversation next to
-- research replies, so Civi knows what happened and can pick the goal back up after sign-in.
begin;
create table public.organizer_chat_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  thread_key text not null check (thread_key ~ '^(main|venue|outreach|volunteers|discover|platform_[a-z][a-z0-9_]{1,39})$'),
  actor_id uuid not null references auth.users(id),
  message text not null check (length(btrim(message)) between 1 and 3000),
  action jsonb not null check (jsonb_typeof(action) = 'object' and action ? 'type' and octet_length(action::text) <= 2000),
  status text not null default 'started' check (status in ('started','needs_user','succeeded','failed')),
  reply text not null default '' check (length(reply) <= 2000),
  resume_goal text not null default '' check (length(resume_goal) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index organizer_chat_actions_thread on public.organizer_chat_actions(organization_id, thread_key, created_at desc);
alter table public.organizer_chat_actions enable row level security;
create policy member_read on public.organizer_chat_actions for select to authenticated using (private.is_member(organization_id));
revoke all on public.organizer_chat_actions from public, anon, authenticated;
grant select on public.organizer_chat_actions to authenticated;
grant all on public.organizer_chat_actions to service_role;

-- Any member may record their own instruction; the tools themselves enforce who may act
-- (connections need an owner or administrator, agents need an administrator).
create function public.log_chat_action(workspace uuid, thread text, chat_message text, chat_action jsonb, outcome text, outcome_reply text, goal text default '') returns uuid
language plpgsql security definer set search_path = '' as $$
declare item uuid;
begin
  if not private.is_member(workspace) then raise exception 'Organization membership required' using errcode = '42501'; end if;
  insert into public.organizer_chat_actions(organization_id, thread_key, actor_id, message, action, status, reply, resume_goal)
  values (workspace, thread, auth.uid(), left(chat_message, 3000), chat_action, outcome, left(coalesce(outcome_reply, ''), 2000), left(coalesce(goal, ''), 1000))
  returning id into item;
  return item;
end $$;

-- Only the person who gave the instruction updates its outcome.
create function public.update_chat_action(target uuid, outcome text, outcome_reply text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.organizer_chat_actions set status = outcome, reply = left(coalesce(outcome_reply, ''), 2000), updated_at = now()
  where id = target and actor_id = auth.uid() and private.is_member(organization_id);
  if not found then raise exception 'That action can no longer be updated' using errcode = '42501'; end if;
end $$;

revoke all on function public.log_chat_action(uuid,text,text,jsonb,text,text,text), public.update_chat_action(uuid,text,text) from public, anon;
grant execute on function public.log_chat_action(uuid,text,text,jsonb,text,text,text), public.update_chat_action(uuid,text,text) to authenticated;

do $$ begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.organizer_chat_actions;
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
