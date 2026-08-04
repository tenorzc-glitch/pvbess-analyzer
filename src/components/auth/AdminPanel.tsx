import { useEffect, useState } from 'react';
import { Card, Typography, Empty, Tag, Table, Space, Alert, Input, Button, Modal, message } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
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

interface AdminProject {
  id: string;
  name: string;
  country: string;
  user_id: string;
  updated_at?: string;
}

export default function AdminPanel() {
  const { user, isAdmin, unlockAdmin } = useAuth();
  const { t } = useTranslation();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activateCode, setActivateCode] = useState('');
  const [activating, setActivating] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!isAdmin || !isSupabaseConfigured() || !supabase) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [profileRes, projectRes] = await Promise.all([
          supabase.from('profiles').select('id, email, role, created_at').limit(100),
          supabase.from('projects').select('id, name, country, user_id, updated_at').limit(500),
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
        setProjects((projectRes.data || []) as AdminProject[]);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || t('common.loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isAdmin, reloadKey]);

  const handleActivate = async () => {
    if (!activateCode.trim()) return;
    setActivating(true);
    const ok = await unlockAdmin(activateCode.trim());
    setActivating(false);
    if (ok) {
      message.success(t('admin.activateSuccess'));
    } else {
      message.error(t('admin.activateFailed'));
    }
  };

  const handleDeleteProject = (p: AdminProject) => {
    Modal.confirm({
      title: t('admin.deleteProjectConfirm'),
      content: `"${p.name}"`,
      onOk: async () => {
        if (!supabase) return;
        const { error: err } = await supabase.from('projects').delete().eq('id', p.id);
        if (err) {
          message.error(err.message);
        } else {
          setReloadKey((k) => k + 1);
        }
      },
    });
  };

  const emailOf = (uid: string) => users.find((u) => u.id === uid)?.email || uid;

  if (!isAdmin) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Title level={4}>{t('admin.noPermission')}</Title>
        <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>{t('admin.noPermissionTip')}</Text>
        {user && (
          <Space direction="vertical" style={{ width: 280, margin: '0 auto' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>{t('admin.activateTip')}</Text>
            <Space.Compact style={{ width: '100%' }}>
              <Input.Password
                placeholder={t('admin.activateCode')}
                value={activateCode}
                onChange={(e) => setActivateCode(e.target.value)}
                onPressEnter={handleActivate}
              />
              <Button type="primary" loading={activating} onClick={handleActivate}>
                {t('admin.activateBtn')}
              </Button>
            </Space.Compact>
          </Space>
        )}
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
                title: t('admin.email'),
                dataIndex: 'email',
                render: (v: string, r) => (
                  <Space direction="vertical" size={0}>
                    <Text>{v}</Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>{r.id}</Text>
                  </Space>
                ),
              },
              {
                title: t('admin.role'),
                dataIndex: 'role',
                width: 100,
                render: (v: string) => (
                  <Tag color={v === 'admin' ? 'gold' : 'blue'}>
                    {v === 'admin' ? t('admin.roleAdmin') : t('admin.roleUser')}
                  </Tag>
                ),
              },
              {
                title: t('admin.projectCount'),
                dataIndex: 'projectCount',
                width: 100,
              },
              {
                title: t('admin.registerTime'),
                dataIndex: 'created_at',
                width: 140,
                render: (v?: string) => v ? new Date(v).toLocaleDateString('zh-CN') : '-',
              },
            ]}
          />
        )}
      </Card>

      <Card title={`${t('admin.projects')}（${projects.length}）`}>
        {projects.length === 0 ? (
          <Empty description={t('admin.noProjects')} />
        ) : (
          <Table<AdminProject>
            rowKey="id"
            size="small"
            loading={loading}
            dataSource={projects}
            pagination={{ pageSize: 10 }}
            columns={[
              { title: t('admin.projectName'), dataIndex: 'name' },
              { title: t('admin.owner'), dataIndex: 'user_id', render: (v: string) => emailOf(v) },
              { title: t('project.country'), dataIndex: 'country', width: 110, render: (v: string) => t(`country.${v}`, v) },
              {
                title: t('admin.updatedAt'), dataIndex: 'updated_at', width: 140,
                render: (v?: string) => v ? new Date(v).toLocaleDateString('zh-CN') : '-',
              },
              {
                title: t('admin.actions'), key: 'actions', width: 80,
                render: (_: unknown, r: AdminProject) => (
                  <Button
                    type="text"
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() => handleDeleteProject(r)}
                  />
                ),
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
