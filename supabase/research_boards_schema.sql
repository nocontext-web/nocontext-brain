-- Research boards: keyword-driven TikTok/Reels pull, scored for free the
-- instant a video lands, AI-analysed only on demand for the winners. Extends
-- the existing research_patterns table (supabase-ideate.sql) rather than
-- replacing it — that table already holds the per-video AI breakdown
-- (hook/format/why-it-popped/pattern/angles), this just adds board grouping,
-- richer stats, and a virality score so a keyword pull can be ranked and
-- browsed instead of only ever analysing one pasted URL at a time.
--
-- Run this once in the Supabase SQL editor.

create table if not exists research_boards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_id uuid references clients(id) on delete set null,
  client_name text,
  keywords text[] not null default '{}',
  platforms text[] not null default '{tiktok,instagram}',
  rollup_report text,
  rollup_generated_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists research_boards_client_idx on research_boards(client_id);

alter table research_patterns add column if not exists board_id uuid references research_boards(id) on delete set null;
alter table research_patterns add column if not exists shares integer default 0;
alter table research_patterns add column if not exists saves integer default 0;
alter table research_patterns add column if not exists comments integer default 0;
alter table research_patterns add column if not exists virality_score integer;
alter table research_patterns add column if not exists comment_analysis jsonb;
alter table research_patterns add column if not exists thumbnail_url text;
alter table research_patterns add column if not exists graduated boolean default false;

-- Confirmed no duplicate video_urls exist in this table before adding this —
-- upsert-on-rerun (re-pulling a board refreshes stats instead of duplicating
-- rows) depends on it.
create unique index if not exists research_patterns_video_url_key on research_patterns(video_url);
create index if not exists research_patterns_board_idx on research_patterns(board_id);
create index if not exists research_patterns_virality_idx on research_patterns(virality_score desc);

alter table if exists research_boards enable row level security;
