import { useEffect, useState } from 'react';
import { Card, Typography, Empty, Tag, Table, Space, Alert } from 'antd';
import { useAuth } from '../../hooks/useAuth';
import { isCloudBaseConfigured, getDb } from '../../cloudbase/client';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;

interface AdminUser {
  uid: string;
  email: string;
  role: string;
  createdAt?: string;
  projectCount: number;
}

export default function AdminPanel() {
  const { user, isAdmin } = useAuth();
  const { t } = useTranslation();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin || !isCloudBaseConfigured()) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const db = getDb();
        const [userRes, projectRes] = await Promise.all([
          db.collection('users').limit(100).get(),
          db.collection('projects').limit(500).get(),
        ]);
        if (cancelled) return;
        const projectCountByUid = new Map<string, number>();
        (projectRes.data || []).forEach((p: any) => {
          const uid = p._openid;
          projectCountByUid.set(uid, (projectCountByUid.get(uid) || 0) + 1);
        });
        const list: AdminUser[] = (userRes.data || []).map((d: any) => ({
          uid: d._id,
          email: d.email || d._id,
          role: d.role === 'admin' ? 'admin' : 'user',
          createdAt: d.createdAt,
          projectCount: projectCountByUid.get(d._id) || 0,
        }));
        setUsers(list);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || '加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Title level={4}>{t('admin.noPermission')}</Title>
        <Text type="secondary">{t('admin.noPermissionTip')}</Text>
      </div>
    );
  }

  return (
    <div>
      <Title level={3}>{t('admin.title')}</Title>

      {!isCloudBaseConfigured() && (
        <Alert type="info" showIcon message={t('admin.offlineTip')} style={{ marginBottom: 16 }} />
      )}

      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}

      <Card title={`${t('admin.users')}（${users.length}）`} style={{ marginBottom: 16 }}>
        {users.length === 0 ? (
          <Empty description={t('admin.noUsers')} />
        ) : (
          <Table<AdminUser>
            rowKey="uid"
            size="small"
            loading={loading}
            dataSource={users}
            pagination={{ pageSize: 10 }}
            columns={[
              {
                title: '邮箱 / UID',
                dataIndex: 'email',
                render: (v: string, r) => (
                  <Space direction="vertical" size={0}>
                    <Text>{v}</Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>{r.uid}</Text>
                  </Space>
                ),
              },
              {
                title: '角色',
                dataIndex: 'role',
                width: 100,
                render: (v: string) => (
                  <Tag color={v === 'admin' ? 'gold' : 'blue'}>
                    {v === 'admin' ? '管理员' : '用户'}
                  </Tag>
                ),
              },
              {
                title: t('admin.projectCount'),
                dataIndex: 'projectCount',
                width: 100,
              },
              {
                title: '注册时间',
                dataIndex: 'createdAt',
                width: 140,
                render: (v?: string) => v ? new Date(v).toLocaleDateString('zh-CN') : '-',
              },
            ]}
          />
        )}
      </Card>

      <Card title={t('admin.projects')}>
        <Text type="secondary">{t('admin.projectsHint')}</Text>
      </Card>
    </div>
  );
}
