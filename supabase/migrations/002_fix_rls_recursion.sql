-- ============================================================
-- RLS 递归修复脚本（在 Supabase SQL Editor 中粘贴执行）
-- 问题：原策略中 (SELECT role FROM profiles WHERE id = auth.uid()) 导致无限递归
-- 方案：用 SECURITY DEFINER 函数 is_admin() 避免递归
-- ============================================================

-- 1. 创建安全助手函数
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 2. Profiles - 替换递归策略
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

-- 3. Projects - 替换递归策略
DROP POLICY IF EXISTS "Admin CRUD all projects" ON public.projects;
CREATE POLICY "Admin CRUD all projects" ON public.projects
  FOR ALL USING (public.is_admin());

-- 4. Simulation Results - 替换递归策略
DROP POLICY IF EXISTS "Admin access all sim results" ON public.simulation_results;
CREATE POLICY "Admin access all sim results" ON public.simulation_results
  FOR ALL USING (public.is_admin());

-- 5. Finance Results - 替换递归策略
DROP POLICY IF EXISTS "Admin access all finance results" ON public.finance_results;
CREATE POLICY "Admin access all finance results" ON public.finance_results
  FOR ALL USING (public.is_admin());

-- 6. Brand Params - 替换递归策略
DROP POLICY IF EXISTS "Admin manage brand params" ON public.brand_params;
CREATE POLICY "Admin manage brand params" ON public.brand_params
  FOR ALL USING (public.is_admin());
