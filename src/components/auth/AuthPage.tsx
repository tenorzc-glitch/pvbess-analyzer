import { useState } from 'react';
import { Card, Form, Input, Button, Typography, Space, Alert, Divider, Tabs } from 'antd';
import { MailOutlined, LockOutlined } from '@ant-design/icons';
import { useAuth } from '../../hooks/useAuth';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;

export default function AuthPage() {
  const { signIn, signUp, cloudMode, loading: authLoading } = useAuth();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleLogin = async (values: { email: string; password: string }) => {
    setLoading(true);
    setError(null);
    setInfo(null);
    const { error: err } = await signIn(values.email, values.password);
    if (err) setError(err);
    setLoading(false);
  };

  const handleRegister = async (values: { email: string; password: string }) => {
    setLoading(true);
    setError(null);
    setInfo(null);
    const { error: err, info: msg } = await signUp(values.email, values.password);
    if (err) setError(err);
    if (msg) setInfo(msg);
    setLoading(false);
  };

  const loginTab = (
    <Form onFinish={handleLogin} layout="vertical" size="large">
      <Form.Item name="email" rules={[{ required: cloudMode, message: t('auth.emailRequired') }]}>
        <Input prefix={<MailOutlined />} placeholder={cloudMode ? t('auth.email') : `${t('auth.email')}（离线可选）`} />
      </Form.Item>
      <Form.Item name="password" rules={[{ required: cloudMode, message: t('auth.passwordRequired') }]}>
        <Input.Password prefix={<LockOutlined />} placeholder={cloudMode ? t('auth.password') : `${t('auth.password')}（离线可选）`} />
      </Form.Item>
      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
      <Button type="primary" htmlType="submit" loading={loading || authLoading} block>
        {t('auth.loginBtn')}
      </Button>
    </Form>
  );

  const registerTab = cloudMode ? (
    <Form onFinish={handleRegister} layout="vertical" size="large">
      <Form.Item
        name="email"
        rules={[
          { required: true, message: t('auth.emailRequired') },
          { type: 'email', message: t('auth.emailRequired') },
        ]}
      >
        <Input prefix={<MailOutlined />} placeholder={t('auth.email')} />
      </Form.Item>
      <Form.Item
        name="password"
        rules={[
          { required: true, message: t('auth.passwordRequired') },
          { min: 8, message: t('auth.passwordMinLength') },
        ]}
        extra={<Text type="secondary" style={{ fontSize: 12 }}>8-32位，需包含字母和数字</Text>}
      >
        <Input.Password prefix={<LockOutlined />} placeholder={t('auth.password')} />
      </Form.Item>
      <Form.Item
        name="confirm"
        dependencies={['password']}
        rules={[
          { required: true, message: t('auth.confirmRequired') },
          ({ getFieldValue }) => ({
            validator(_, value) {
              if (!value || getFieldValue('password') === value) return Promise.resolve();
              return Promise.reject(new Error(t('auth.passwordMismatch')));
            },
          }),
        ]}
      >
        <Input.Password prefix={<LockOutlined />} placeholder={t('auth.confirmPassword')} />
      </Form.Item>
      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
      {info && <Alert type="success" message={info} style={{ marginBottom: 16 }} />}
      <Button type="primary" htmlType="submit" loading={loading} block>
        {t('auth.registerBtn')}
      </Button>
    </Form>
  ) : (
    <Alert type="info" message={t('auth.offlineNotSupported')} />
  );

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    }}>
      <Card style={{ width: 420, boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}>
        <Space direction="vertical" style={{ width: '100%', textAlign: 'center', marginBottom: 16 }}>
          <Title level={3} style={{ margin: 0 }}>PV·BESS Analyzer</Title>
          <Text type="secondary">{t('app.subtitle')}</Text>
        </Space>

        <Tabs
          defaultActiveKey="login"
          centered
          items={[
            { key: 'login', label: t('auth.login'), children: loginTab },
            { key: 'register', label: t('auth.register'), children: registerTab },
          ]}
        />

        {!cloudMode && (
          <>
            <Divider />
            <Text type="secondary" style={{ fontSize: 12, display: 'block', textAlign: 'center' }}>
              {t('auth.offlineTip')}
              <br />
              {t('auth.adminTip')}
            </Text>
          </>
        )}
      </Card>
    </div>
  );
}
