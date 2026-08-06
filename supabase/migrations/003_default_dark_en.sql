-- ============================================================
-- 003: 新注册用户默认偏好改为 深色主题 + 英语
-- 在 Supabase SQL Editor 中粘贴执行（全选 → Run）
-- 仅影响此后新创建的用户档案；已有用户的显式偏好不受影响。
-- ============================================================

-- 1. 列默认值
ALTER TABLE public.profiles ALTER COLUMN theme SET DEFAULT 'dark';
ALTER TABLE public.profiles ALTER COLUMN language SET DEFAULT 'en';

-- 2. 触发器升级为读取注册元数据（app 注册时会下发 theme/language）
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
