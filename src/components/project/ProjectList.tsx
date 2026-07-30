import { useState } from 'react';
import { Card, Button, Space, Modal, Input, Select, Typography, Empty } from 'antd';
import { PlusOutlined, ProjectOutlined, CopyOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useProjectStore } from '../../store/useProjectStore';
import { Project, CountryCode } from '../../types';

const { Title, Text } = Typography;

const COUNTRY_OPTIONS: { value: CountryCode; label: string }[] = [
  { value: 'brazil', label: '巴西 Brazil' },
  { value: 'mexico', label: '墨西哥 Mexico' },
  { value: 'colombia', label: '哥伦比亚 Colombia' },
  { value: 'chile', label: '智利 Chile' },
  { value: 'peru', label: '秘鲁 Peru' },
  { value: 'custom', label: '自定义 Custom' },
];

export default function ProjectList() {
  const navigate = useNavigate();
  const { projects, addProject, deleteProject } = useProjectStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCountry, setNewCountry] = useState<CountryCode>('brazil');

  const handleCreate = () => {
    if (!newName.trim()) return;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const project: Project = {
      id,
      name: newName.trim(),
      country: newCountry,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'draft',
    };
    addProject(project);
    setModalOpen(false);
    setNewName('');
    navigate(`/project/${id}`);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>项目列表</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          新建项目
        </Button>
      </div>

      {projects.length === 0 ? (
        <Card>
          <Empty description={'暂无项目，点击"新建项目"开始'}>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
              新建项目
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
                <CopyOutlined key="copy" onClick={(e) => { e.stopPropagation(); }} />,
                <DeleteOutlined
                  key="delete"
                  style={{ color: '#ff4d4f' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    Modal.confirm({
                      title: '确认删除',
                      content: `确定删除项目"${p.name}"？`,
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
                      创建于 {new Date(p.createdAt).toLocaleDateString('zh-CN')}
                    </Text>
                  </Space>
                }
              />
            </Card>
          ))}
        </div>
      )}

      <Modal
        title="新建项目"
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => setModalOpen(false)}
        okText="创建"
        cancelText="取消"
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text strong>项目名称</Text>
            <Input
              placeholder="例如：墨西哥光伏农场 500kW"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onPressEnter={handleCreate}
              style={{ marginTop: 4 }}
            />
          </div>
          <div>
            <Text strong>国家/地区</Text>
            <Select
              value={newCountry}
              onChange={setNewCountry}
              options={COUNTRY_OPTIONS}
              style={{ width: '100%', marginTop: 4 }}
            />
          </div>
        </Space>
      </Modal>
    </div>
  );
}
