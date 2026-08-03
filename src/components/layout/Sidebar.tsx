import { Layout, Menu, Button, Space, Switch, Typography } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ProjectOutlined,
  LogoutOutlined,
  SettingOutlined,
  BulbOutlined,
  GlobalOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../hooks/useAuth';
import { useTranslation } from 'react-i18next';

const { Sider } = Layout;
const { Text } = Typography;

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut, isAdmin, updateProfile } = useAuth();
  const { t, i18n } = useTranslation();

  const isDark = user?.theme === 'dark';
  const language = user?.language === 'en' ? 'en' : 'zh';

  const toggleTheme = async (checked: boolean) => {
    await updateProfile({ theme: checked ? 'dark' : 'light' });
  };

  const toggleLanguage = async () => {
    const next = language === 'zh' ? 'en' : 'zh';
    await updateProfile({ language: next });
    i18n.changeLanguage(next);
  };

  return (
    <Sider
      width={220}
      style={{
        background: '#001529',
        overflow: 'auto',
        height: '100vh',
        position: 'sticky',
        top: 0,
        left: 0,
      }}
    >
      <div style={{
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontSize: 16,
        fontWeight: 700,
        letterSpacing: 1,
        borderBottom: '1px solid rgba(255,255,255,0.1)',
      }}>
        PV·BESS Analyzer
      </div>

      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[location.pathname]}
        onClick={({ key }) => navigate(key)}
        items={[
          { key: '/', icon: <ProjectOutlined />, label: t('nav.projects') },
          ...(isAdmin ? [{ key: '/admin', icon: <SettingOutlined />, label: t('nav.admin') }] : []),
        ]}
        style={{ marginTop: 8 }}
      />

      {/* User Info & Controls */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        width: '100%',
        padding: 16,
        borderTop: '1px solid rgba(255,255,255,0.1)',
      }}>
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, display: 'block', wordBreak: 'break-all' }}>
            {user?.email || t('common.offlineUser')}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, display: 'block' }}>
            {isAdmin ? t('nav.admin') : t('nav.user')}
          </Text>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Space size={4}>
              <BulbOutlined style={{ color: 'rgba(255,255,255,0.65)' }} />
              <Switch
                size="small"
                checked={isDark}
                onChange={toggleTheme}
                checkedChildren={t('theme.dark')}
                unCheckedChildren={t('theme.light')}
              />
            </Space>
            <Space size={4}>
              <GlobalOutlined style={{ color: 'rgba(255,255,255,0.65)' }} />
              <Button
                type="text"
                size="small"
                onClick={toggleLanguage}
                style={{ color: 'rgba(255,255,255,0.65)', padding: 0 }}
              >
                {language === 'zh' ? 'EN' : '中文'}
              </Button>
            </Space>
            <Button
              type="text"
              size="small"
              icon={<LogoutOutlined />}
              onClick={signOut}
              style={{ color: 'rgba(255,255,255,0.65)' }}
            >
              {t('nav.logout')}
            </Button>
          </Space>
        </Space>
      </div>
    </Sider>
  );
}
