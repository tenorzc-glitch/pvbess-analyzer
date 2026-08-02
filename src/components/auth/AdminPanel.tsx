import { useEffect, useState } from 'react';
import { Card, Typography, Empty, Tag, Table, Space, Alert } from 'antd';
import { useAuth } from '../../hooks/useAuth';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;

interface AdminUser {
  id: string;
  email: string;
  role: string;
  created_at?: string;
  projectCount: number;
}

export default function AdminPanel() {
  const { user, isAdmin } = useAuth();
  const { t } = useTranslation();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin || !isSupabaseConfigured() || !supabase) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [profileRes, projectRes] = await Promise.all([
          supabase.from('profiles').select('id, email, role, created_at').limit(100),
          supabase.from('projects').select('user_id').limit(500),
        ]);
        if (cancelled) return;
        if (profileRes.error) throw profileRes.error;
        const projectCountByUid = new Map<string, number>();
        (projectRes.data || []).forEach((p: any) => {
          const uid = p.user_id;
          projectCountByUid.set(uid, (projectCountByUid.get(uid) || 0) + 1);
        });
        const list: AdminUser[] = (profileRes.data || []).map((d: any) => ({
          id: d.id,
          email: d.email || d.id,
          role: d.role === 'admin' ? 'admin' : 'user',
          created_at: d.created_at,
          projectCount: projectCountByUid.get(d.id) || 0,
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

      {!isSupabaseConfigured() && (
        <Alert type="info" showIcon message={t('admin.offlineTip')} style={{ marginBottom: 16 }} />
      )}

      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}

      <Card title={`${t('admin.users')}（${users.length}）`} style={{ marginBottom: 16 }}>
        {users.length === 0 ? (
          <Empty description={t('admin.noUsers')} />
        ) : (
          <Table<AdminUser>
            rowKey="id"
            size="small"
            loading={loading}
            dataSource={users}
            pagination={{ pageSize: 10 }}
            columns={[
              {
                title: '邮箱 / ID',
                dataIndex: 'email',
                render: (v: string, r) => (
                  <Space direction="vertical" size={0}>
                    <Text>{v}</Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>{r.id}</Text>
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
                dataIndex: 'created_at',
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
