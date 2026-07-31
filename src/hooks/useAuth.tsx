import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { isCloudBaseConfigured, getAuth, getDb, callPromoteAdmin } from '../cloudbase/client';

export interface AuthUser {
  uid: string;
  email: string;
  role: 'user' | 'admin';
  theme: 'light' | 'dark';
  language: 'zh' | 'en';
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  /** 是否已接入 CloudBase（在线模式） */
  cloudMode: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string) => Promise<{ error?: string; info?: string }>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  unlockAdmin: (password: string) => Promise<boolean>;
  /** 更新偏好（主题/语言），在线时持久化到 users 文档，离线存 localStorage */
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
        uid: u.uid || 'local-' + Date.now(),
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

/** 从 SDK 回调载荷中兼容提取 uid/email（新形态 state.user.uid / 旧形态 state.uid） */
function extractUserInfo(state: any): { uid?: string; email?: string } {
  if (!state) return {};
  if (state.user?.uid) return { uid: state.user.uid, email: state.user.email };
  if (state.uid) return { uid: state.uid, email: state.email };
  return {};
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // 初始化：CloudBase 会话恢复 or 离线 localStorage
  useEffect(() => {
    if (isCloudBaseConfigured()) {
      let unsub: (() => void) | undefined;
      const auth = getAuth();
      setLoading(true);
      unsub = auth.onLoginStateChanged(async (state: any) => {
        const { uid, email: rawEmail } = extractUserInfo(state);
        const email = rawEmail || '';
        if (uid) {
          try {
            const db = getDb();
            const res = await db.collection('users').doc(uid).get();
            const doc = res.data as any;
            if (doc && doc._id) {
              setUser({
                uid,
                email: doc.email || email,
                role: doc.role === 'admin' ? 'admin' : 'user',
                theme: doc.theme === 'dark' ? 'dark' : 'light',
                language: doc.language === 'en' ? 'en' : 'zh',
              });
            } else {
              // 首次登录：创建 users 文档（安全规则要求 create 时不含 role）
              try {
                await db.collection('users').doc(uid).set({
                  email,
                  theme: 'light',
                  language: 'zh',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                });
              } catch { /* 已存在或规则拒绝时忽略 */ }
              setUser({ uid, email, role: 'user', theme: 'light', language: 'zh' });
            }
          } catch {
            setUser({ uid, email, role: 'user', theme: 'light', language: 'zh' });
          }
        } else {
          setUser(null);
        }
        setLoading(false);
      });
      return () => { unsub?.(); };
    }
    // 离线模式
    setUser(getStoredUser());
    setLoading(false);
    return undefined;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!isCloudBaseConfigured()) {
      // 离线模式：任意邮箱，密码为管理员密码则提升管理员
      const u: AuthUser = {
        uid: 'local-' + Date.now(),
        email: email || 'user@local',
        role: password === ADMIN_PASSWORD ? 'admin' : 'user',
        theme: localStorage.getItem('pv-bess-theme') === 'dark' ? 'dark' : 'light',
        language: localStorage.getItem('pv-bess-language') === 'en' ? 'en' : 'zh',
      };
      setUser(u);
      saveUser(u);
      return {};
    }
    try {
      await getAuth().signInWithEmailAndPassword(email, password);
      return {};
    } catch (e: any) {
      return { error: e?.message || '登录失败，请检查邮箱和密码' };
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!isCloudBaseConfigured()) {
      return { error: '当前离线模式，无需注册，直接登录即可' };
    }
    try {
      await getAuth().signUpWithEmailAndPassword(email, password);
      return { info: '注册成功！激活邮件已发送到你的邮箱，请查收并点击激活链接（可能进入垃圾箱）。' };
    } catch (e: any) {
      return { error: e?.message || '注册失败' };
    }
  }, []);

  const signOut = useCallback(async () => {
    if (isCloudBaseConfigured()) {
      try { await getAuth().signOut(); } catch { /* ignore */ }
    }
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const unlockAdmin = useCallback(async (password: string): Promise<boolean> => {
    if (!user) return false;
    if (isCloudBaseConfigured()) {
      try {
        const res = await callPromoteAdmin(password);
        if (res?.ok) {
          const updated = { ...user, role: 'admin' as const };
          setUser(updated);
          saveUser(updated);
          return true;
        }
        return false;
      } catch { return false; }
    }
    if (password === ADMIN_PASSWORD) {
      const updated = { ...user, role: 'admin' as const };
      setUser(updated);
      saveUser(updated);
      return true;
    }
    return false;
  }, [user]);

  const updateProfile = useCallback(async (updates: Partial<Pick<AuthUser, 'theme' | 'language'>>) => {
    if (!user) return;
    const updated = { ...user, ...updates };
    setUser(updated);
    saveUser(updated);
    if (isCloudBaseConfigured()) {
      try {
        await getDb().collection('users').doc(user.uid).update({
          ...updates,
          updatedAt: new Date().toISOString(),
        });
      } catch { /* 网络失败：本地已保存，恢复后重试 */ }
    }
  }, [user]);

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      cloudMode: isCloudBaseConfigured(),
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
