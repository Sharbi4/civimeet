begin;
create table public.organizer_approval_history (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 approval_id uuid not null references public.organizer_approvals(id) on delete cascade,
 actor_id uuid not null references auth.users(id), action text not null, snapshot jsonb not null, created_at timestamptz not null default now()
);
alter table public.organizer_approval_history enable row level security;
create policy member_read on public.organizer_approval_history for select to authenticated using(private.is_member(organization_id));
revoke all on public.organizer_approval_history from public,anon,authenticated;
grant select on public.organizer_approval_history to authenticated;
grant all on public.organizer_approval_history to service_role;
create function private.record_organizer_approval_revision() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.organizer_approval_history(organization_id,approval_id,actor_id,action,snapshot)
 values(new.organization_id,new.id,auth.uid(),case when tg_op='INSERT' then 'draft_created' when new.revision<>old.revision then 'draft_edited' else 'draft_'||new.status end,to_jsonb(new));
 return new;
end; $$;
create trigger organizer_approval_revision after insert or update on public.organizer_approvals for each row execute function private.record_organizer_approval_revision();
commit;
