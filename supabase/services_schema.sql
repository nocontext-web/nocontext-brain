-- Run this in the Supabase SQL editor

ALTER TABLE clients ADD COLUMN IF NOT EXISTS services text[];
