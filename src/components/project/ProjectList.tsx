import { useEffect, useState } from 'react';
import { Card, Button, Space, Modal, Input, Select, Typography, Empty, Alert } from 'antd';
import { PlusOutlined, ProjectOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useProjectStore } from '../../store/useProjectStore';
import { useSimulationStore } from '../../store/useSimulationStore';
import { useTranslation } from 'react-i18next';
import { Project, CountryCode } from '../../types';
import { applyCountryPreset, COUNTRY_PRESETS } from '../../data/countries';

const { Title, Text } = Typography;

export default function ProjectList() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('en') ? 'en' : 'zh';

  const COUNTRY_OPTIONS: { value: CountryCode; label: string }[] = [
    { value: 'brazil', label: t('country.brazil') },
    { value: 'mexico', label: t('country.mexico') },
    { value: 'colombia', label: t('country.colombia') },
    { value: 'chile', label: t('country.chile') },
    { value: 'peru', label: t('country.peru') },
    { value: 'custom', label: t('country.custom') },
  ];

  const { projects, syncState, cloudMode, loadProjects, addProject, deleteProject } = useProjectStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCountry, setNewCountry] = useState<CountryCode>('brazil');
  const [creating, setCreating] = useState(false);

  // 进入页面时加载项目（在线从云端，离线从缓存）
  useEffect(() => {
    loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const project: Project = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      name: newName.trim(),
      country: newCountry,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'draft',
      // 按国家+行业应用预设参数（用户仍可修改）
      params: applyCountryPreset(newCountry),
      scenarios: useSimulationStore.getState().scenarios,
    };
    const saved = await addProject(project);
    setCreating(false);
    setModalOpen(false);
    setNewName('');
    navigate(`/project/${saved.id}`);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>{t('project.list')}</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          {t('project.create')}
        </Button>
      </div>

      {syncState === 'offline' && (
        <Alert
          type="warning"
          showIcon
          message={cloudMode ? t('sync.offlineCloud') : t('sync.offline')}
          style={{ marginBottom: 16 }}
        />
      )}

      {projects.length === 0 ? (
        <Card>
          <Empty description={t('project.noProjects')}>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
              {t('project.create')}
            </Button>
          </Empty>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {projects.map((p) => (
            <Card
              key={p.id}
              hoverable
              onClick={() => navigate(`/project/${p.id}`)}
              actions={[
                <DeleteOutlined
                  key="delete"
                  style={{ color: '#ff4d4f' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    Modal.confirm({
                      title: t('project.deleteConfirm'),
                      content: `"${p.name}"`,
                      onOk: () => deleteProject(p.id),
                    });
                  }}
                />,
              ]}
            >
              <Card.Meta
                avatar={<ProjectOutlined style={{ fontSize: 32, color: '#1677ff' }} />}
                title={p.name}
                description={
                  <Space direction="vertical" size={2}>
                    <Text type="secondary">
                      {COUNTRY_OPTIONS.find(c => c.value === p.country)?.label || p.country}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {t('project.createdAt')} {new Date(p.createdAt).toLocaleDateString('zh-CN')}
                    </Text>
                  </Space>
                }
              />
            </Card>
          ))}
        </div>
      )}

      <Modal
        title={t('project.create')}
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => setModalOpen(false)}
        okText={t('common.create')}
        cancelText={t('common.cancel')}
        confirmLoading={creating}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text strong>{t('project.name')}</Text>
            <Input
              placeholder={t('project.namePlaceholder')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onPressEnter={handleCreate}
              style={{ marginTop: 4 }}
            />
          </div>
          <div>
            <Text strong>{t('project.country')}</Text>
            <Select
              value={newCountry}
              onChange={setNewCountry}
              options={COUNTRY_OPTIONS}
              style={{ width: '100%', marginTop: 4 }}
            />
            {COUNTRY_PRESETS[newCountry] && (
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                {t('project.presetApplied')} — {COUNTRY_PRESETS[newCountry]!.note[lang]}
              </Text>
            )}
          </div>
        </Space>
      </Modal>
    </div>
  );
}
