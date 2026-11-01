-- Drafts created by the agent runner (service role, no signed-in session) record the plan's
-- creator as the actor instead of failing the history insert; people's edits still record them.
begin;
create or replace function private.record_organizer_approval_revision() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.organizer_approval_history(organization_id,approval_id,actor_id,action,snapshot)
 values(new.organization_id,new.id,coalesce(auth.uid(),case when tg_op='INSERT' then new.created_by else coalesce(new.reviewed_by,new.created_by) end),
  case when tg_op='INSERT' then 'draft_created' when new.revision<>old.revision then 'draft_edited' else 'draft_'||new.status end,to_jsonb(new));
 return new;
end; $$;
commit;
