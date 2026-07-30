import { Card, Typography, Empty, Tag } from 'antd';
import { useAuth } from '../../hooks/useAuth';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;

export default function AdminPanel() {
  const { user, isAdmin } = useAuth();
  const { t } = useTranslation();

  if (!isAdmin) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Title level={4}>无权限访问</Title>
        <Text type="secondary">仅管理员可以访问此页面</Text>
      </div>
    );
  }

  return (
    <div>
      <Title level={3}>{t('admin.title')}</Title>
      <Card title={t('admin.users')} style={{ marginBottom: 16 }}>
        <Empty description={t('admin.noUsers')} />
      </Card>
      <Card title={t('admin.projects')}>
        <Empty description={t('admin.noUsers')} />
      </Card>
    </div>
  );
}
