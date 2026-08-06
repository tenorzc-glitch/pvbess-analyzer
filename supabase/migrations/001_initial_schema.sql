-- ============================================================
-- PV-BESS Analyzer: Database Schema
-- 在 Supabase SQL Editor 中粘贴执行（全选 → Run）
-- ============================================================

-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 2. Profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  theme TEXT DEFAULT 'dark' CHECK (theme IN ('light', 'dark')),
  language TEXT DEFAULT 'en' CHECK (language IN ('zh', 'en')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. Auto-create profile trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, theme, language)
  VALUES (
    NEW.id,
    NEW.email,
    'user',
    COALESCE(NEW.raw_user_meta_data->>'theme', 'dark'),
    COALESCE(NEW.raw_user_meta_data->>'language', 'en')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 4. Projects
-- ============================================================
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'brazil',
  description TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'complete')),
  params JSONB NOT NULL DEFAULT '{}',
  scenarios JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_updated ON public.projects(updated_at DESC);

-- ============================================================
-- 5. Profile Data
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profile_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'custom' CHECK (type IN ('template', 'uploaded', 'custom')),
  country TEXT,
  data JSONB NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profile_data_user_id ON public.profile_data(user_id);

-- ============================================================
-- 6. Simulation Results Cache
-- ============================================================
CREATE TABLE IF NOT EXISTS public.simulation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  results JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sim_results_project ON public.simulation_results(project_id);

-- ============================================================
-- 7. Finance Results Cache
-- ============================================================
CREATE TABLE IF NOT EXISTS public.finance_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  results JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_results_project ON public.finance_results(project_id);

-- ============================================================
-- 8. Brand Parameters
-- ============================================================
CREATE TABLE IF NOT EXISTS public.brand_params (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  params JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert brands (use separate INSERT so one failure doesn't block the rest)
INSERT INTO public.brand_params (name, display_name, params) 
SELECT 'industry_avg', '行业平均', '{
  "efficiencyCharge": 0.96,
  "efficiencyDischarge": 0.96,
  "sohCurve": [1.0, 0.975, 0.95, 0.925, 0.9, 0.875, 0.85, 0.825, 0.8, 0.775],
  "costPerKWh": 1350,
  "pcsCostPerKW": 650,
  "opexRate": 0.015
}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.brand_params WHERE name = 'industry_avg');

INSERT INTO public.brand_params (name, display_name, params) 
SELECT 'HW', 'HW', '{
  "efficiencyCharge": 0.975,
  "efficiencyDischarge": 0.975,
  "sohCurve": [1.0, 0.98, 0.96, 0.94, 0.92, 0.90, 0.88, 0.86, 0.84, 0.82],
  "costPerKWh": 1500,
  "pcsCostPerKW": 750,
  "opexRate": 0.012
}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.brand_params WHERE name = 'HW');

-- ============================================================
-- 9. Admin helper function
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_admin_user(admin_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.profiles SET role = 'admin' WHERE id = admin_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 10. RLS Policies
-- ============================================================

-- 安全助手函数：判断当前用户是否为管理员（SECURITY DEFINER 避免递归）
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admin read all profiles" ON public.profiles;
CREATE POLICY "Admin read all profiles" ON public.profiles
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Admin update profiles" ON public.profiles;
CREATE POLICY "Admin update profiles" ON public.profiles
  FOR UPDATE USING (public.is_admin());

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Projects
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users CRUD own projects" ON public.projects;
CREATE POLICY "Users CRUD own projects" ON public.projects
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admin CRUD all projects" ON public.projects;
CREATE POLICY "Admin CRUD all projects" ON public.projects
  FOR ALL USING (public.is_admin());

-- Profile Data
ALTER TABLE public.profile_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read all profile data" ON public.profile_data;
CREATE POLICY "Users read all profile data" ON public.profile_data
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users insert own profile data" ON public.profile_data;
CREATE POLICY "Users insert own profile data" ON public.profile_data
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users update own profile data" ON public.profile_data;
CREATE POLICY "Users update own profile data" ON public.profile_data
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own profile data" ON public.profile_data;
CREATE POLICY "Users delete own profile data" ON public.profile_data
  FOR DELETE USING (auth.uid() = user_id);

-- Simulation Results
ALTER TABLE public.simulation_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users access own sim results" ON public.simulation_results;
CREATE POLICY "Users access own sim results" ON public.simulation_results
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.projects 
            WHERE id = simulation_results.project_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admin access all sim results" ON public.simulation_results;
CREATE POLICY "Admin access all sim results" ON public.simulation_results
  FOR ALL USING (public.is_admin());

-- Finance Results
ALTER TABLE public.finance_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users access own finance results" ON public.finance_results;
CREATE POLICY "Users access own finance results" ON public.finance_results
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.projects 
            WHERE id = finance_results.project_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admin access all finance results" ON public.finance_results;
CREATE POLICY "Admin access all finance results" ON public.finance_results
  FOR ALL USING (public.is_admin());

-- Brand Params
ALTER TABLE public.brand_params ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "All users read brand params" ON public.brand_params;
CREATE POLICY "All users read brand params" ON public.brand_params
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin manage brand params" ON public.brand_params;
CREATE POLICY "Admin manage brand params" ON public.brand_params
  FOR ALL USING (public.is_admin());
