-- Saypost: client invite links and agency workspaces.
-- - workspaces.kind: 'business' (one local business, today's UI) or 'agency' (many clients).
-- - workspaces.brand_name / logo_url: optional agency branding for the client's invite page and
--   Zernio's connect screen. Editable by the workspace's owners.
-- - invites: a link an agency sends a client so they connect their own networks without an account.
--   Only the SHA-256 of the token is stored; the token is shown once, when the link is created.

-- ---------------------------------------------------------------------------
-- workspaces: kind + branding
-- ---------------------------------------------------------------------------
alter table public.workspaces
  add column kind text not null default 'business' check (kind in ('business', 'agency')),
  add column brand_name text check (brand_name is null or char_length(brand_name) between 1 and 60),
  add column logo_url text check (logo_url is null or (logo_url ~ '^https://[^\s]+$' and char_length(logo_url) <= 2048));
-- Existing workspaces get kind = 'business' from the default.

create or replace function public.is_workspace_owner(wid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members m
     where m.workspace_id = wid and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;
revoke execute on function public.is_workspace_owner(uuid) from public, anon;
grant execute on function public.is_workspace_owner(uuid) to authenticated;

-- Owners may change the branding; kind and name go through the backend.
create policy workspaces_update on public.workspaces for update to authenticated
  using (public.is_workspace_owner(id)) with check (public.is_workspace_owner(id));
grant update (brand_name, logo_url) on public.workspaces to authenticated;

-- ---------------------------------------------------------------------------
-- invites
-- ---------------------------------------------------------------------------
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),  -- hex SHA-256 of the token
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default now() + interval '14 days',
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index invites_business_idx on public.invites (business_id, created_at desc);

alter table public.invites enable row level security;

-- Members of the business's workspace can see its invites (never the hash). Creating and revoking
-- go through the backend (service role).
create policy invites_select on public.invites for select to authenticated
  using (public.can_access_business(business_id));
revoke all on public.invites from anon, authenticated;
grant select (id, business_id, created_by, expires_at, revoked_at, created_at, last_used_at) on public.invites to authenticated;
