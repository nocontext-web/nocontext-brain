-- The `creators` and `creator_campaigns` tables were defined in
-- supabase-setup.sql but never actually created in this Supabase project —
-- that's why every "file this creator" attempt from Hermes and the brain's
-- Creators page has been failing with "Could not find the table
-- 'public.creators' in the schema cache" (PGRST205). Run this once in the
-- Supabase SQL editor (Project → SQL Editor → New query → Run).
--
-- Adds `city` and `country` as their own columns (instead of one free-text
-- `location`) so "NYC creator" / "USA creator" style filing actually
-- produces something filterable, not just a sentence.

create table if not exists creators (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  ig_handle text,
  ig_followers text,
  tt_handle text,
  tt_followers text,
  yt_handle text,
  yt_followers text,
  tier text, -- 'micro', 'mid', 'macro', 'celebrity'
  categories text[], -- content style + creator type tags, e.g. 'comedy', 'how-to', 'usa ugc'
  location text, -- free-text display fallback, e.g. "New York, NY, USA"
  city text,
  country text,
  gender text,
  rate_notes text,
  notes text,
  status text default 'scouted', -- 'scouted', 'prospect', 'active', 'complete', 'fell_through'
  created_at timestamptz default now()
);

alter table creators add column if not exists city text;
alter table creators add column if not exists country text;

create table if not exists creator_campaigns (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  client_name text,
  deliverables text[],
  content_links text[],
  notes text,
  status text default 'active', -- 'active', 'complete', 'fell_through'
  created_at timestamptz default now()
);

create index if not exists creator_campaigns_creator_idx on creator_campaigns(creator_id);
create index if not exists creators_status_idx on creators(status);
create index if not exists creators_country_idx on creators(country);
create index if not exists creators_city_idx on creators(city);

-- Same posture as every other table (see supabase/enable-rls.sql): RLS on,
-- no policies. service_role (used by the brain, Hermes, and the MCP bridge)
-- bypasses RLS by design, so this only blocks the public anon key.
alter table if exists creators enable row level security;
alter table if exists creator_campaigns enable row level security;
