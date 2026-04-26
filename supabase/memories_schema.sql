-- Run this in the Supabase SQL editor

CREATE TABLE IF NOT EXISTS memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('client', 'contact', 'decision', 'creative_insight', 'taste_note', 'process_rule', 'opinion', 'general')),
  content text NOT NULL,
  source text, -- 'training', 'transcript', 'granola', 'research', 'voice', 'quick'
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'archived')),
  related_client text,
  tags text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER memories_updated_at
  BEFORE UPDATE ON memories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Index for fast active memory queries
CREATE INDEX IF NOT EXISTS memories_status_type ON memories (status, type);
CREATE INDEX IF NOT EXISTS memories_client ON memories (related_client) WHERE related_client IS NOT NULL;

-- RLS: allow full access with service role
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON memories FOR ALL USING (true);

-- Add missing columns to clients if not present
ALTER TABLE clients ADD COLUMN IF NOT EXISTS priority text DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low'));
ALTER TABLE clients ADD COLUMN IF NOT EXISTS monthly_value numeric;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS next_action text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS next_action_date date;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
