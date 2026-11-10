-- Actions Civi takes for the organization in its live browser (post, comment, like, join,
-- message...). Each one waits for a person's approval in the chat, is keyed by the model's tool
-- call so a reconnect never repeats it, and records its real outcome. Service-role access only;
-- the server checks the person's editor role before recording a decision.
begin;
create table private.organizer_browser_actions (
  id uuid primary key default gen_random_uuid(),
  organizer_session_id uuid not null references public.organizer_sessions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  call_key text not null unique check (length(call_key) between 1 and 300),
  description text not null check (length(description) between 1 and 500),
  site text not null default '' check (length(site) <= 300),
  write_text text check (write_text is null or length(write_text) <= 5000),
  status text not null default 'pending' check (status in ('pending','approved','declined','executing','done','failed','expired')),
  result text check (result is null or length(result) <= 16000),
  decided_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index organizer_browser_actions_pending on private.organizer_browser_actions(organizer_session_id) where status = 'pending';
alter table private.organizer_browser_actions enable row level security;
revoke all on private.organizer_browser_actions from public, anon, authenticated;
grant all on private.organizer_browser_actions to service_role;

-- Ask for approval once per tool call; asking again returns the same request.
create function public.request_browser_action(conversation uuid, workspace uuid, key text, action_description text, action_site text, action_text text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare item private.organizer_browser_actions;
begin
  if not exists(select 1 from public.organizer_sessions where id = conversation and organization_id = workspace) then
    raise exception 'Unknown conversation';
  end if;
  insert into private.organizer_browser_actions(organizer_session_id, organization_id, call_key, description, site, write_text)
  values (conversation, workspace, key, left(action_description, 500), left(coalesce(action_site, ''), 300), nullif(left(coalesce(action_text, ''), 5000), ''))
  on conflict (call_key) do nothing;
  select * into item from private.organizer_browser_actions where call_key = key and organization_id = workspace;
  return to_jsonb(item);
end $$;

create function public.browser_action_status(key text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(a) from private.organizer_browser_actions a where a.call_key = key;
$$;

-- A person's decision (the server has already checked they can edit this organization).
create function public.decide_browser_action(workspace uuid, actor uuid, target uuid, approve boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare next_status text := case when approve then 'approved' else 'declined' end;
begin
  if not exists(select 1 from public.organization_members where organization_id = workspace and user_id = actor and role in ('owner','admin','organizer')) then
    raise exception 'Editor access required';
  end if;
  update private.organizer_browser_actions set status = next_status, decided_by = actor, decided_at = now()
  where id = target and organization_id = workspace and status = 'pending';
  if not found then raise exception 'This request was already decided or has expired.'; end if;
  return next_status;
end $$;

-- The executor records what really happened: executing → done | failed, or pending → expired.
create function public.mark_browser_action(key text, next_status text, outcome text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if next_status not in ('executing','done','failed','expired') then raise exception 'Invalid status'; end if;
  update private.organizer_browser_actions set status = next_status, result = coalesce(left(outcome, 16000), result)
  where call_key = key
    and ((next_status = 'executing' and status = 'approved')
      or (next_status in ('done','failed') and status = 'executing')
      or (next_status = 'expired' and status = 'pending'));
end $$;

create function public.pending_browser_actions(conversation uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'description', a.description, 'site', a.site, 'text', a.write_text) order by a.created_at), '[]'::jsonb)
  from private.organizer_browser_actions a
  where a.organizer_session_id = conversation and a.status = 'pending' and a.created_at > now() - interval '15 minutes';
$$;

revoke all on function public.request_browser_action(uuid,uuid,text,text,text,text), public.browser_action_status(text),
  public.decide_browser_action(uuid,uuid,uuid,boolean), public.mark_browser_action(text,text,text), public.pending_browser_actions(uuid)
  from public, anon, authenticated;
grant execute on function public.request_browser_action(uuid,uuid,text,text,text,text), public.browser_action_status(text),
  public.decide_browser_action(uuid,uuid,uuid,boolean), public.mark_browser_action(text,text,text), public.pending_browser_actions(uuid)
  to service_role;
notify pgrst, 'reload schema';
commit;
