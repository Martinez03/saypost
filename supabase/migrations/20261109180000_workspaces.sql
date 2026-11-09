-- Saypost: workspaces (agencies). A workspace holds one or many businesses; every member of the
-- workspace sees and manages all of them. A single local business is just a workspace with one
-- business. Backward compatible: existing businesses get their own workspace, and inserting a
-- business without workspace_id puts it in the creator's first workspace (or a new one).

-- ---------------------------------------------------------------------------
-- workspaces + members
-- ---------------------------------------------------------------------------
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

-- ---------------------------------------------------------------------------
-- businesses: workspace + approval mode; a user may now create many businesses
-- ---------------------------------------------------------------------------
alter table public.businesses
  add column workspace_id uuid references public.workspaces(id) on delete cascade,
  -- owner_whatsapp: the business owner approves on WhatsApp (and anyone in the dashboard).
  -- agency_dashboard: only the dashboard approves; the owner is told the agency reviews it.
  add column approval_mode text not null default 'owner_whatsapp'
    check (approval_mode in ('owner_whatsapp', 'agency_dashboard'));

-- Backfill: one workspace per existing business, named after it, its owner as workspace owner.
do $$
declare
  r record;
  wid uuid;
begin
  for r in select id, name, owner_id from public.businesses where workspace_id is null order by created_at loop
    insert into public.workspaces (name, created_by) values (r.name, r.owner_id) returning id into wid;
    insert into public.workspace_members (workspace_id, user_id, role) values (wid, r.owner_id, 'owner')
      on conflict do nothing;
    update public.businesses set workspace_id = wid where id = r.id;
  end loop;
end;
$$;

alter table public.businesses alter column workspace_id set not null;
create index businesses_workspace_idx on public.businesses (workspace_id, created_at);

-- owner_id now means "created by": no longer one business per user.
drop index public.businesses_owner_idx;
create index businesses_owner_idx on public.businesses (owner_id);

-- A business inserted without workspace_id goes to the creator's first workspace where they are
-- owner, or to a new workspace named after the business (keeps the old onboarding insert working).
create or replace function public.businesses_default_workspace() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  wid uuid;
begin
  if new.workspace_id is not null then
    return new;
  end if;
  select m.workspace_id into wid
    from public.workspace_members m
    join public.workspaces w on w.id = m.workspace_id
   where m.user_id = new.owner_id and m.role = 'owner'
   order by w.created_at
   limit 1;
  if wid is null then
    insert into public.workspaces (name, created_by) values (new.name, new.owner_id) returning id into wid;
    insert into public.workspace_members (workspace_id, user_id, role) values (wid, new.owner_id, 'owner');
  end if;
  new.workspace_id := wid;
  return new;
end;
$$;
revoke execute on function public.businesses_default_workspace() from public, anon, authenticated;

create trigger businesses_default_workspace before insert on public.businesses
  for each row execute function public.businesses_default_workspace();

-- ---------------------------------------------------------------------------
-- RLS: access by workspace membership instead of business ownership
-- ---------------------------------------------------------------------------
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

create or replace function public.is_workspace_member(wid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workspace_members m where m.workspace_id = wid and m.user_id = auth.uid());
$$;

create or replace function public.can_access_business(bid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.businesses b
      join public.workspace_members m on m.workspace_id = b.workspace_id
     where b.id = bid and m.user_id = auth.uid()
  );
$$;

-- Same check for the policies on businesses, but VOLATILE: a STABLE function uses the statement's
-- snapshot and would not see the workspace that the BEFORE INSERT trigger has just created (first
-- business of a new user), neither in the insert check nor in the select check of INSERT … RETURNING.
create or replace function public.in_workspace(wid uuid) returns boolean
language sql volatile security definer set search_path = '' as $$
  select exists (select 1 from public.workspace_members m where m.workspace_id = wid and m.user_id = auth.uid());
$$;

revoke execute on function public.is_workspace_member(uuid) from public, anon;
revoke execute on function public.can_access_business(uuid) from public, anon;
revoke execute on function public.in_workspace(uuid) from public, anon;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.can_access_business(uuid) to authenticated;
grant execute on function public.in_workspace(uuid) to authenticated;

drop policy businesses_select on public.businesses;
drop policy businesses_insert on public.businesses;
drop policy businesses_update on public.businesses;
drop policy social_accounts_select on public.social_accounts;
drop policy messages_select on public.messages;
drop policy actions_select on public.actions;
drop policy events_select on public.events;
drop function public.is_business_owner(uuid);

create policy businesses_select on public.businesses for select to authenticated
  using (public.in_workspace(workspace_id));
-- workspace_id is filled by the trigger above (BEFORE triggers run before this check).
create policy businesses_insert on public.businesses for insert to authenticated
  with check (owner_id = auth.uid() and public.in_workspace(workspace_id));
create policy businesses_update on public.businesses for update to authenticated
  using (public.in_workspace(workspace_id)) with check (public.in_workspace(workspace_id));

create policy social_accounts_select on public.social_accounts for select to authenticated
  using (public.can_access_business(business_id));
create policy messages_select on public.messages for select to authenticated
  using (public.can_access_business(business_id));
create policy actions_select on public.actions for select to authenticated
  using (public.can_access_business(business_id));
create policy events_select on public.events for select to authenticated
  using (public.can_access_business(business_id));

create policy workspaces_select on public.workspaces for select to authenticated
  using (public.is_workspace_member(id));
create policy workspace_members_select on public.workspace_members for select to authenticated
  using (user_id = auth.uid() or public.is_workspace_member(workspace_id));

-- Workspaces and memberships are created by the trigger or the backend, never by the web.
revoke all on public.workspaces from anon, authenticated;
revoke all on public.workspace_members from anon, authenticated;
grant select on public.workspaces to authenticated;
grant select on public.workspace_members to authenticated;

-- The web may pick the workspace when creating a business and change the approval mode.
-- workspace_id is not updatable: a business does not move between workspaces from the web.
grant insert (workspace_id, approval_mode) on public.businesses to authenticated;
grant update (approval_mode) on public.businesses to authenticated;
