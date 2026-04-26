-- Run this in your Supabase SQL editor at supabase.com → your project → SQL editor

-- Structured research patterns (replaces dumping into Caspar's memory blob)
CREATE TABLE IF NOT EXISTS research_patterns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  platform TEXT,
  author TEXT,
  video_url TEXT,
  caption TEXT,
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  hook TEXT,
  format TEXT,
  structure TEXT,
  why_it_popped TEXT,
  pattern TEXT,
  no_context_angles TEXT,
  full_analysis TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Concepts generated in Ideate (saved for reuse + flow into Scripts)
CREATE TABLE IF NOT EXISTS concepts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  format TEXT NOT NULL,
  title TEXT NOT NULL,
  hook TEXT NOT NULL,
  concept TEXT NOT NULL,
  why TEXT,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Saved scripts (output of Generate)
CREATE TABLE IF NOT EXISTS scripts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  concept_id UUID REFERENCES concepts(id) ON DELETE SET NULL,
  format TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
