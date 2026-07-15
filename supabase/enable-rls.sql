-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query → Run).
--
-- Every table below except `memories` has never had Row-Level Security
-- enabled, meaning the public `anon` key (shipped in the brain app's browser
-- bundle, same as every Supabase app) has full read/write/delete access to
-- all of it directly over the internet, bypassing the app entirely.
-- `google_tokens` holds real Gmail/Calendar OAuth tokens in plaintext — this
-- is the most urgent one.
--
-- This is safe to run: every real code path (brain, Hermes, Caspar, the MCP
-- bridge) uses the service_role key, which always bypasses RLS by design.
-- Enabling RLS with no policies blocks the public anon key completely and
-- changes nothing about how your own systems work.

ALTER TABLE IF EXISTS google_tokens        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS clients              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS creators             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS creator_campaigns    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS templates            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS agent_thoughts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS agent_prompts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS obsidian_notes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS calendar_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS research_patterns    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS concepts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS scripts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS todos                ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS email_inbox          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS conversation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS agent_memory         ENABLE ROW LEVEL SECURITY;

-- memories already had RLS on, but its only policy was `USING (true)` with
-- no role restriction, which Postgres defaults to PUBLIC — i.e. it granted
-- the same full access to anon as having no policy at all. Drop it; no
-- replacement policy is needed since service_role bypasses RLS anyway.
DROP POLICY IF EXISTS "service_role_all" ON memories;
