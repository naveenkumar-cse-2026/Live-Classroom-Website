-- ============================================================
-- ENORA LIVE AI CLASSROOM — Migration 002: Enable Realtime & RLS
-- Run this in your Supabase Dashboard → SQL Editor
-- URL: https://supabase.com/dashboard/project/cbjzqpaoekawzkntqykx/sql
-- ============================================================

-- 1. Enable Row Level Security on all tables
ALTER TABLE public.app_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_auth ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_sessions ENABLE ROW LEVEL SECURITY;

-- 2. Grant permissions
-- anon and authenticated can SELECT app_state (for Supabase Realtime client in frontend)
GRANT SELECT ON public.app_state TO anon, authenticated;
GRANT ALL ON public.app_state TO service_role;

-- Strictly restrict app_auth (passwords) and app_sessions to service_role only
GRANT ALL ON public.app_auth TO service_role;
REVOKE ALL ON public.app_auth FROM anon, authenticated;

GRANT ALL ON public.app_sessions TO service_role;
REVOKE ALL ON public.app_sessions FROM anon, authenticated;

-- 3. RLS Policies for app_state
DROP POLICY IF EXISTS "Allow public read app_state" ON public.app_state;
CREATE POLICY "Allow public read app_state"
  ON public.app_state
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow service_role all app_state" ON public.app_state;
CREATE POLICY "Allow service_role all app_state"
  ON public.app_state
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 4. RLS Policies for app_auth & app_sessions (service_role only)
DROP POLICY IF EXISTS "Allow service_role all app_auth" ON public.app_auth;
CREATE POLICY "Allow service_role all app_auth"
  ON public.app_auth
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service_role all app_sessions" ON public.app_sessions;
CREATE POLICY "Allow service_role all app_sessions"
  ON public.app_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 5. Enable REPLICA IDENTITY FULL so Realtime events include full column values
ALTER TABLE public.app_state REPLICA IDENTITY FULL;

-- 6. Ensure app_state is added to supabase_realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'app_state'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.app_state;
  END IF;
END $$;
