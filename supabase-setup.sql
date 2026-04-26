-- Agent prompts (overrides the hardcoded defaults in agents.js)
create table if not exists agent_prompts (
  agent text primary key,
  prompt text not null,
  updated_at timestamptz default now()
);

-- agent_memory already exists in nocontext-slack — same table, shared Supabase

-- Clients
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website text,
  instagram text,
  tiktok text,
  brief text,
  north_star text,
  research_notes text,
  created_at timestamptz default now()
);

-- Templates (format definitions)
create table if not exists templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  content text not null,
  created_at timestamptz default now()
);

-- Agent thoughts / mind log
create table if not exists agent_thoughts (
  id uuid primary key default gen_random_uuid(),
  agent text not null,
  type text not null, -- 'thought', 'opinion', 'question', 'reaction', 'observation'
  content text not null,
  context text, -- what triggered this thought (a message, a dropped URL, etc)
  created_at timestamptz default now()
);

create index if not exists agent_thoughts_agent_idx on agent_thoughts(agent);
create index if not exists agent_thoughts_created_idx on agent_thoughts(created_at desc);

-- Creators / Influencer Encyclopedia
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
  categories text[],
  location text,
  gender text,
  rate_notes text,
  notes text,
  status text default 'prospect', -- 'prospect', 'active', 'complete', 'fell_through'
  created_at timestamptz default now()
);

-- Work creators have done (per client)
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

-- Obsidian vault notes (synced from Josh's local vault)
create table if not exists obsidian_notes (
  id uuid primary key default gen_random_uuid(),
  path text unique not null,       -- relative path e.g. "Clients/Tokyo Headspa.md"
  folder text not null,            -- top-level folder: Clients, Creators, Culture, Campaigns, Taste
  title text not null,             -- filename without .md
  content text not null,
  updated_at timestamptz default now()
);

create index if not exists obsidian_notes_folder_idx on obsidian_notes(folder);

-- Google OAuth tokens
create table if not exists google_tokens (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  access_token text,
  refresh_token text not null,
  expiry_date bigint,
  updated_at timestamptz default now()
);

-- Calendar events (synced from Google Calendar)
create table if not exists calendar_events (
  id text primary key,
  title text,
  start_time timestamptz,
  end_time timestamptz,
  attendees text[],
  location text,
  description text,
  updated_at timestamptz default now()
);
