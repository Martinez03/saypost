-- Saypost: initial schema. One business per user (MVP). The backend uses the service role;
-- the web reads with the user's session through RLS.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- businesses
-- ---------------------------------------------------------------------------
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  category text,                       -- e.g. "bar", "hair salon"
  city text,
  description text,                    -- what the business is, offers, hours… (the "ficha")
  tone text not null default 'friendly' check (tone in ('friendly', 'professional', 'fun', 'elegant')),
  language text not null default 'es' check (language in ('es', 'en')),
  timezone text not null default 'Europe/Madrid',
  notes text not null default '',      -- things Saypost learned from the owner ("no emojis", "closed on Mondays")
  owner_phone text unique check (owner_phone ~ '^[0-9]{8,15}$'),  -- digits-only E.164
  whatsapp_status text not null default 'inactive' check (whatsapp_status in ('inactive', 'pending', 'active')),
  whatsapp_conversation_id text,
  whatsapp_account_id text,
  whatsapp_last_inbound_at timestamptz,
  zernio_profile_id text unique,
  notify_comments boolean not null default true,
  notify_reviews boolean not null default true,
  notify_dms boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index businesses_owner_idx on public.businesses (owner_id);

-- ---------------------------------------------------------------------------
-- social_accounts: accounts connected to the business's Zernio profile
-- ---------------------------------------------------------------------------
create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  zernio_account_id text not null unique,
  platform text not null,
  username text,
  display_name text,
  profile_picture text,
  status text not null default 'connected' check (status in ('connected', 'disconnected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index social_accounts_business_idx on public.social_accounts (business_id);

-- ---------------------------------------------------------------------------
-- messages: the WhatsApp conversation between the owner and Saypost
-- ---------------------------------------------------------------------------
create table public.messages (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  kind text not null default 'text' check (kind in ('text', 'audio', 'image', 'video', 'system')),
  body text not null default '',       -- text, or the transcript of an audio
  media_url text,                      -- public Zernio URL of an image/video the owner sent
  zernio_message_id text,
  created_at timestamptz not null default now()
);
create index messages_business_idx on public.messages (business_id, created_at desc);

-- ---------------------------------------------------------------------------
-- actions: everything that publishes, replies, deletes or spends waits here for a "yes"
-- ---------------------------------------------------------------------------
create table public.actions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  kind text not null check (kind in ('publish', 'reply_review', 'reply_comment', 'reply_dm', 'cancel_post', 'boost')),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'done', 'failed', 'superseded')),
  title text not null,                 -- one line for lists ("Post on Instagram + Facebook")
  preview text not null,               -- exactly what will be published / sent
  payload jsonb not null,              -- what the executor needs (validated in code)
  context jsonb,                       -- what triggered it (review, comment, DM…) for the UI
  source text not null default 'whatsapp' check (source in ('whatsapp', 'webhook', 'dashboard')),
  result jsonb,
  error text,
  decided_via text check (decided_via in ('whatsapp', 'dashboard')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  executed_at timestamptz
);
create index actions_business_idx on public.actions (business_id, created_at desc);
create index actions_pending_idx on public.actions (business_id) where status = 'pending';

-- ---------------------------------------------------------------------------
-- events: activity feed for the dashboard
-- ---------------------------------------------------------------------------
create table public.events (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  type text not null,                  -- post.published, review.new, comment.received, action.done…
  title text not null,
  data jsonb,
  created_at timestamptz not null default now()
);
create index events_business_idx on public.events (business_id, created_at desc);

-- ---------------------------------------------------------------------------
-- backend-only tables (no policies: only the service role reads them)
-- ---------------------------------------------------------------------------
create table public.webhook_events (
  id text primary key,                 -- Zernio event id (dedupe key)
  event text not null,
  received_at timestamptz not null default now()
);

create table public.seen_items (
  key text primary key,                -- e.g. "review:<platform id>" for polled Facebook reviews
  business_id uuid references public.businesses(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.usage_ledger (
  id bigint generated always as identity primary key,
  business_id uuid references public.businesses(id) on delete set null,
  provider text not null,              -- anthropic, openai
  model text,
  input_tokens integer,
  output_tokens integer,
  seconds numeric,
  cost_usd numeric(10, 6) not null default 0,
  purpose text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger businesses_touch before update on public.businesses
  for each row execute function public.touch_updated_at();
create trigger social_accounts_touch before update on public.social_accounts
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.businesses enable row level security;
alter table public.social_accounts enable row level security;
alter table public.messages enable row level security;
alter table public.actions enable row level security;
alter table public.events enable row level security;
alter table public.webhook_events enable row level security;
alter table public.seen_items enable row level security;
alter table public.usage_ledger enable row level security;

create or replace function public.is_business_owner(bid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.businesses b where b.id = bid and b.owner_id = auth.uid());
$$;

create policy businesses_select on public.businesses for select to authenticated
  using (owner_id = auth.uid());
create policy businesses_insert on public.businesses for insert to authenticated
  with check (owner_id = auth.uid());
create policy businesses_update on public.businesses for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy social_accounts_select on public.social_accounts for select to authenticated
  using (public.is_business_owner(business_id));
create policy messages_select on public.messages for select to authenticated
  using (public.is_business_owner(business_id));
create policy actions_select on public.actions for select to authenticated
  using (public.is_business_owner(business_id));
create policy events_select on public.events for select to authenticated
  using (public.is_business_owner(business_id));

-- The web may only write profile fields; WhatsApp/Zernio wiring is backend-only.
revoke insert, update on public.businesses from authenticated;
grant insert (owner_id, name, category, city, description, tone, language, timezone)
  on public.businesses to authenticated;
grant update (name, category, city, description, tone, language, timezone, notes,
              notify_comments, notify_reviews, notify_dms)
  on public.businesses to authenticated;
