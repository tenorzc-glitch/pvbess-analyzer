import { useMemo, useEffect } from 'react';
import { ConfigProvider, theme as antdTheme } from 'antd';
import { HashRouter } from 'react-router-dom';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import { AuthProvider, useAuth } from './hooks/useAuth';
import AuthGuard from './components/auth/AuthGuard';
import AppRoutes from './routes';
import AutoInit from './AutoInit';
import i18n from './i18n';

function ThemedApp() {
  const { user } = useAuth();
  // 未登录/无档案时默认：深色 + 英语（登录页同样生效）
  const isDark = (user?.theme ?? 'dark') === 'dark';
  const isEnglish = (user?.language ?? 'en') === 'en';

  // 用户语言变化时同步 i18n
  useEffect(() => {
    i18n.changeLanguage(isEnglish ? 'en' : 'zh');
  }, [isEnglish]);

  const themeConfig = useMemo(() => ({
    algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: '#1677ff',
      borderRadius: 6,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
  }), [isDark]);

  return (
    <ConfigProvider
      locale={isEnglish ? enUS : zhCN}
      theme={themeConfig}
    >
      <HashRouter>
        <AuthGuard>
          <AutoInit />
          <AppRoutes />
        </AuthGuard>
      </HashRouter>
    </ConfigProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <ThemedApp />
    </AuthProvider>
  );
}

export default App;
