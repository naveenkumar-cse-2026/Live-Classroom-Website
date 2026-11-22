-- ============================================================
-- ENORA LIVE AI CLASSROOM — Supabase Schema Migration
-- Migration: 001_initial_schema
-- Run this in your Supabase Dashboard → SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLE: app_state
-- Stores the entire application state as a single JSONB document
-- (matches the existing JSON file database architecture)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.app_state (
  id          TEXT PRIMARY KEY DEFAULT 'singleton',
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  revision    BIGINT NOT NULL DEFAULT 1,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- TABLE: app_auth
-- Stores hashed admin + student credentials (PBKDF2-SHA256)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.app_auth (
  id          TEXT PRIMARY KEY DEFAULT 'singleton',
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- TABLE: app_sessions
-- Stores active session tokens (admin + student)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.app_sessions (
  token       TEXT PRIMARY KEY,
  role        TEXT NOT NULL CHECK (role IN ('admin', 'student')),
  user_id     TEXT NOT NULL,
  user_name   TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);

-- Index for fast session lookup and TTL cleanup
CREATE INDEX IF NOT EXISTS idx_app_sessions_expires_at ON public.app_sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_app_sessions_user_id ON public.app_sessions (user_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- All tables are backend-only (accessed via service_role key).
-- Disable RLS so the backend can read/write without policies.
-- Frontend NEVER accesses Supabase directly.
-- ============================================================
ALTER TABLE public.app_state DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_auth DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_sessions DISABLE ROW LEVEL SECURITY;

-- Grant full access to service_role (backend)
GRANT ALL ON public.app_state TO service_role;
GRANT ALL ON public.app_auth TO service_role;
GRANT ALL ON public.app_sessions TO service_role;

-- Revoke all access from anon role (no direct frontend access)
REVOKE ALL ON public.app_state FROM anon;
REVOKE ALL ON public.app_auth FROM anon;
REVOKE ALL ON public.app_sessions FROM anon;

-- ============================================================
-- FUNCTION: cleanup_expired_sessions
-- Called periodically to remove expired sessions
-- ============================================================
CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.app_sessions WHERE expires_at <= now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ============================================================
-- REALTIME: Enable for app_state so future upgrades can
-- subscribe to database changes
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_state;

-- ============================================================
-- SEED: Insert empty singleton rows (upsert safe)
-- ============================================================
INSERT INTO public.app_state (id, data, revision, updated_at)
VALUES ('singleton', '{}'::jsonb, 0, now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.app_auth (id, data, updated_at)
VALUES ('singleton', '{}'::jsonb, now())
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- DONE
-- After running this migration:
-- 1. Copy your service_role key from Supabase Dashboard
--    → Project Settings → API → service_role (secret)
-- 2. Add to your .env:
--    SUPABASE_SERVICE_KEY=your_service_role_key_here
-- 3. Add the same variable in Vercel Dashboard
--    → Project → Settings → Environment Variables
-- ============================================================
