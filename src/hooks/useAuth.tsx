import { useState, useEffect, useCallback, createContext, useContext } from 'react';

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
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  unlockAdmin: (password: string) => boolean;
}

const ADMIN_PASSWORD = '934676';

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signIn: async () => ({}),
  signUp: async () => ({}),
  signOut: async () => {},
  isAdmin: false,
  unlockAdmin: () => false,
});

function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem('pv-bess-user');
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveUser(user: AuthUser) {
  localStorage.setItem('pv-bess-user', JSON.stringify(user));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(getStoredUser);
  const [loading, setLoading] = useState(false);

  const signIn = useCallback(async (email: string, password: string) => {
    const u: AuthUser = {
      id: 'local-' + Date.now(),
      email: email || 'user@local',
      role: password === ADMIN_PASSWORD ? 'admin' : 'user',
      theme: 'light',
      language: 'zh',
    };
    setUser(u);
    saveUser(u);
    return {};
  }, []);

  const signUp = useCallback(async (_email: string, _password: string) => {
    return { error: '离线模式不需要注册，直接登录即可' };
  }, []);

  const signOut = useCallback(async () => {
    setUser(null);
    localStorage.removeItem('pv-bess-user');
  }, []);

  const unlockAdmin = useCallback((password: string): boolean => {
    if (password === ADMIN_PASSWORD && user) {
      const updated = { ...user, role: 'admin' as const };
      setUser(updated);
      saveUser(updated);
      return true;
    }
    return false;
  }, [user]);

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      signIn,
      signUp,
      signOut,
      isAdmin: user?.role === 'admin',
      unlockAdmin,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
