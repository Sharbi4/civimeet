create table public.organization_payment_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  monthly_budget_cents bigint not null default 0 check (monthly_budget_cents between 0 and 100000000),
  auto_approve_limit_cents bigint not null default 0 check (auto_approve_limit_cents between 0 and 1000000),
  provider text check (provider in ('stripe','plaid')),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
grant select on public.organization_payment_settings to authenticated;
grant all on public.organization_payment_settings to service_role;
alter table public.organization_payment_settings enable row level security;
create policy "Members read payment settings" on public.organization_payment_settings
  for select to authenticated using (private.is_member(organization_id));

create table public.agent_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent text not null default 'main' check (agent ~ '^[a-z][a-z0-9_]{1,39}$'),
  payee text not null check (length(btrim(payee)) between 2 and 200),
  purpose text not null check (length(btrim(purpose)) between 3 and 1000),
  category text not null check (category in ('vendor','venue','ad_boost','platform_fee','other')),
  amount_cents bigint not null check (amount_cents between 1 and 100000000),
  currency text not null default 'usd' check (currency = 'usd'),
  status text not null default 'needs_approval' check (status in ('needs_approval','approved','rejected','paid','failed','cancelled')),
  approval text not null default 'pending' check (approval in ('pending','auto','person')),
  over_budget boolean not null default false,
  budget_month date not null,
  requested_by uuid,
  decided_by uuid,
  decided_at timestamptz,
  paid_at timestamptz,
  provider_reference text check (length(provider_reference) <= 200),
  created_at timestamptz not null default now()
);
create index agent_payments_scope on public.agent_payments(organization_id, budget_month, created_at desc);
grant select on public.agent_payments to authenticated;
grant all on public.agent_payments to service_role;
alter table public.agent_payments enable row level security;
create policy "Members read agent payments" on public.agent_payments
  for select to authenticated using (private.is_member(organization_id));

create function public.save_payment_settings(workspace uuid, budget_cents bigint, auto_limit_cents bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin(workspace) then raise exception 'Organization administrator access required'; end if;
  if budget_cents < 0 or budget_cents > 100000000 then raise exception 'Monthly budget must be between $0 and $1,000,000'; end if;
  if auto_limit_cents < 0 or auto_limit_cents > 1000000 then raise exception 'Automatic approval limit must be between $0 and $10,000'; end if;
  if auto_limit_cents > budget_cents then raise exception 'Automatic approval limit cannot exceed the monthly budget'; end if;
  insert into public.organization_payment_settings(organization_id, monthly_budget_cents, auto_approve_limit_cents, updated_by, updated_at)
  values (workspace, budget_cents, auto_limit_cents, auth.uid(), now())
  on conflict (organization_id) do update set monthly_budget_cents = excluded.monthly_budget_cents,
    auto_approve_limit_cents = excluded.auto_approve_limit_cents, updated_by = excluded.updated_by, updated_at = now();
  insert into public.vendor_activity(organization_id, actor_id, action)
  values (workspace, auth.uid(), 'payment_settings_updated');
end; $$;

create function private.month_committed(workspace uuid, month date) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(amount_cents), 0)::bigint from public.agent_payments
  where organization_id = workspace and budget_month = month and status in ('approved','paid');
$$;

create function public.request_agent_payment(workspace uuid, helper text, payee_name text, payment_purpose text, payment_category text, cents bigint)
returns public.agent_payments language plpgsql security definer set search_path = '' as $$
declare
  settings public.organization_payment_settings;
  month date := date_trunc('month', now())::date;
  committed bigint;
  result public.agent_payments;
  automatic boolean;
  over boolean;
begin
  if not private.can_edit(workspace) then raise exception 'Organization editor access required'; end if;
  if cents is null or cents < 1 or cents > 100000000 then raise exception 'Invalid payment amount'; end if;
  select * into settings from public.organization_payment_settings where organization_id = workspace;
  committed := private.month_committed(workspace, month);
  over := settings.organization_id is null or committed + cents > settings.monthly_budget_cents;
  automatic := not over and cents <= coalesce(settings.auto_approve_limit_cents, 0);
  insert into public.agent_payments(organization_id, agent, payee, purpose, category, amount_cents, status, approval, over_budget, budget_month, requested_by, decided_at)
  values (workspace, coalesce(nullif(helper, ''), 'main'), btrim(payee_name), btrim(payment_purpose), payment_category, cents,
    case when automatic then 'approved' else 'needs_approval' end,
    case when automatic then 'auto' else 'pending' end,
    over, month, auth.uid(), case when automatic then now() end)
  returning * into result;
  insert into public.vendor_activity(organization_id, actor_id, action)
  values (workspace, auth.uid(), 'payment_' || case when automatic then 'auto_approved' else 'requested' end || ':' || result.id::text);
  return result;
end; $$;

create function public.review_agent_payment(target uuid, decision text) returns void
language plpgsql security definer set search_path = '' as $$
declare item public.agent_payments;
begin
  select * into item from public.agent_payments where id = target for update;
  if not found or not private.is_admin(item.organization_id) then raise exception 'Organization administrator access required'; end if;
  if item.status <> 'needs_approval' then raise exception 'This payment was already decided. Refresh.'; end if;
  if decision not in ('approve','reject') then raise exception 'Invalid decision'; end if;
  if decision = 'approve' and private.month_committed(item.organization_id, item.budget_month) + item.amount_cents >
     coalesce((select monthly_budget_cents from public.organization_payment_settings where organization_id = item.organization_id), 0)
  then
    update public.agent_payments set over_budget = true where id = target;
  end if;
  update public.agent_payments set status = case when decision = 'approve' then 'approved' else 'rejected' end,
    approval = 'person', decided_by = auth.uid(), decided_at = now() where id = target;
  insert into public.vendor_activity(organization_id, actor_id, action)
  values (item.organization_id, auth.uid(), 'payment_' || decision || ':' || target::text);
end; $$;

revoke all on function public.save_payment_settings(uuid,bigint,bigint), public.request_agent_payment(uuid,text,text,text,text,bigint), public.review_agent_payment(uuid,text) from public, anon;
grant execute on function public.save_payment_settings(uuid,bigint,bigint), public.request_agent_payment(uuid,text,text,text,text,bigint), public.review_agent_payment(uuid,text) to authenticated;
revoke all on function private.month_committed(uuid,date) from public, anon, authenticated;