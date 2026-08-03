import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export interface AuthUser {
  id: string;
  email: string;
  role: 'user' | 'admin';
  theme: 'light' | 'dark';
  language: 'zh' | 'en';
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  /** 是否已接入 Supabase（在线模式） */
  cloudMode: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string) => Promise<{ error?: string; info?: string }>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  unlockAdmin: (password: string) => Promise<boolean>;
  /** 更新偏好（主题/语言），在线时持久化到 profiles 表，离线存 localStorage */
  updateProfile: (updates: Partial<Pick<AuthUser, 'theme' | 'language'>>) => Promise<void>;
}

const ADMIN_PASSWORD = '934676';
const STORAGE_KEY = 'pv-bess-user';

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  cloudMode: false,
  signIn: async () => ({}),
  signUp: async () => ({}),
  signOut: async () => {},
  isAdmin: false,
  unlockAdmin: async () => false,
  updateProfile: async () => {},
});

function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const u = JSON.parse(raw);
      return {
        id: u.id || 'local-' + Date.now(),
        email: u.email || '',
        role: u.role === 'admin' ? 'admin' : 'user',
        theme: u.theme === 'dark' ? 'dark' : 'light',
        language: u.language === 'en' ? 'en' : 'zh',
      };
    }
  } catch { /* ignore */ }
  return null;
}

function saveUser(user: AuthUser) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(user)); } catch { /* ignore */ }
}

/** 从 Supabase session + profiles 行构造 AuthUser */
async function fetchProfile(uid: string, email: string): Promise<AuthUser> {
  if (!supabase) return { id: uid, email, role: 'user', theme: 'light', language: 'zh' };
  try {
    const { data } = await supabase.from('profiles').select('role, theme, language').eq('id', uid).single();
    if (data) {
      return {
        id: uid,
        email,
        role: data.role === 'admin' ? 'admin' : 'user',
        theme: data.theme === 'dark' ? 'dark' : 'light',
        language: data.language === 'en' ? 'en' : 'zh',
      };
    }
  } catch { /* profile 不存在时 trigger 会自动创建，下次登录可读到 */ }
  return { id: uid, email, role: 'user', theme: 'light', language: 'zh' };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // 初始化：Supabase 会话恢复 or 离线 localStorage
  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) {
      setUser(getStoredUser());
      setLoading(false);
      return;
    }

    // 恢复已有会话
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const u = await fetchProfile(session.user.id, session.user.email || '');
        setUser(u);
      }
      setLoading(false);
    });

    // 监听认证状态变化
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          const u = await fetchProfile(session.user.id, session.user.email || '');
          setUser(u);
        } else {
          setUser(null);
        }
        setLoading(false);
      }
    );

    return () => { authListener.subscription.unsubscribe(); };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured() || !supabase) {
      // 离线模式：任意邮箱，密码为管理员密码则提升管理员
      const u: AuthUser = {
        id: 'local-' + Date.now(),
        email: email || 'user@local',
        role: password === ADMIN_PASSWORD ? 'admin' : 'user',
        theme: localStorage.getItem('pv-bess-theme') === 'dark' ? 'dark' : 'light',
        language: localStorage.getItem('pv-bess-language') === 'en' ? 'en' : 'zh',
      };
      setUser(u);
      saveUser(u);
      return {};
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return {};
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured() || !supabase) {
      return { error: '当前离线模式，无需注册，直接登录即可' };
    }
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };
    // 如果邮箱确认已关闭，用户可直接登录；否则提示查收邮件
    if (data.user && !data.session) {
      return { info: '注册成功！请查收激活邮件并点击激活链接（可能进入垃圾箱）。' };
    }
    return { info: '注册成功！已自动登录。' };
  }, []);

  const signOut = useCallback(async () => {
    if (isSupabaseConfigured() && supabase) {
      try { await supabase.auth.signOut(); } catch { /* ignore */ }
    }
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const unlockAdmin = useCallback(async (password: string): Promise<boolean> => {
    if (!user) return false;
    if (!isSupabaseConfigured() || !supabase) {
      if (password === ADMIN_PASSWORD) {
        const updated = { ...user, role: 'admin' as const };
        setUser(updated);
        saveUser(updated);
        return true;
      }
      return false;
    }
    // 在线模式：调用 RPC seed_admin_user
    try {
      const { error } = await supabase.rpc('seed_admin_user', { admin_id: user.id });
      if (!error) {
        const updated = { ...user, role: 'admin' as const };
        setUser(updated);
        saveUser(updated);
        return true;
      }
      // 在线模式 RPC 失败时拒绝提权（仅开发环境允许密码回退）
      if (import.meta.env.DEV && password === ADMIN_PASSWORD) {
        const updated = { ...user, role: 'admin' as const };
        setUser(updated);
        saveUser(updated);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [user]);

  const updateProfile = useCallback(async (updates: Partial<Pick<AuthUser, 'theme' | 'language'>>) => {
    if (!user) return;
    const updated = { ...user, ...updates };
    setUser(updated);
    saveUser(updated);
    if (isSupabaseConfigured() && supabase) {
      try {
        await supabase.from('profiles').update({
          ...updates,
          updated_at: new Date().toISOString(),
        }).eq('id', user.id);
      } catch { /* 网络失败：本地已保存 */ }
    }
  }, [user]);

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      cloudMode: isSupabaseConfigured(),
      signIn,
      signUp,
      signOut,
      isAdmin: user?.role === 'admin',
      unlockAdmin,
      updateProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
