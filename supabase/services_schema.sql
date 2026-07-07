-- Run this in the Supabase SQL editor

ALTER TABLE clients ADD COLUMN IF NOT EXISTS services text[];

-- context_notes was referenced by the clients page panel (Health/Blocker/Scope/Team/Notes)
-- but never migrated — every save there has been silently failing until now.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS context_notes text;
