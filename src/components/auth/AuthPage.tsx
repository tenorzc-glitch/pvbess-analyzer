import { useState } from 'react';
import { Card, Form, Input, Button, Typography, Space, Alert, Divider } from 'antd';
import { MailOutlined, LockOutlined } from '@ant-design/icons';
import { useAuth } from '../../hooks/useAuth';

const { Title, Text } = Typography;

export default function AuthPage() {
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (values: { email: string; password: string }) => {
    setLoading(true);
    setError(null);
    const { error: err } = await signIn(values.email, values.password);
    if (err) setError(err);
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    }}>
      <Card style={{ width: 400, boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}>
        <Space direction="vertical" style={{ width: '100%', textAlign: 'center', marginBottom: 24 }}>
          <Title level={3} style={{ margin: 0 }}>PV·BESS Analyzer</Title>
          <Text type="secondary">拉美光储投资定容与收益测算</Text>
        </Space>

        <Form onFinish={handleLogin} layout="vertical" size="large">
          <Form.Item name="email" rules={[{ required: false }]}>
            <Input prefix={<MailOutlined />} placeholder="用户名（可选）" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: false }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码（管理员需要）" />
          </Form.Item>
          {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
          <Button type="primary" htmlType="submit" loading={loading} block>
            进入应用
          </Button>
        </Form>

        <Divider />
        <Text type="secondary" style={{ fontSize: 12, display: 'block', textAlign: 'center' }}>
          直接点击"进入应用"无需填写任何信息<br />
          管理员功能需输入密码
        </Text>
      </Card>
    </div>
  );
}
