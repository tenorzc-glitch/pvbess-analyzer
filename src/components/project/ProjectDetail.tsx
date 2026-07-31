import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Tabs, Typography, Button, Space, Alert } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useProjectStore } from '../../store/useProjectStore';
import { useParamsStore } from '../../store/useParamsStore';
import { useSimulationStore } from '../../store/useSimulationStore';
import { useSimulation } from '../../hooks/useSimulation';
import { useTranslation } from 'react-i18next';
import InputsPanel from '../inputs/InputsPanel';
import SizingPanel from '../sizing/SizingPanel';
import ResultsPanel from '../results/ResultsPanel';
import FinancePanel from '../finance/FinancePanel';

const { Title } = Typography;

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const projects = useProjectStore((s) => s.projects);
  const syncState = useProjectStore((s) => s.syncState);
  const updateProject = useProjectStore((s) => s.updateProject);
  const setParams = useParamsStore((s) => s.setParams);
  const params = useParamsStore((s) => s.params);
  const setScenarios = useSimulationStore((s) => s.setScenarios);
  const scenarios = useSimulationStore((s) => s.scenarios);
  const project = projects.find((p) => p.id === id);

  useSimulation();

  // 进入项目时：从云端数据初始化参数与方案配置
  useEffect(() => {
    if (project?.params) {
      try { setParams(project.params as any); } catch { /* 数据异常时保持默认 */ }
    }
    if (project?.scenarios && Array.isArray(project.scenarios)) {
      try { setScenarios(project.scenarios as any); } catch { /* 保持默认 */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  // 参数变更 debounce 500ms 落库
  useEffect(() => {
    if (!id) return;
    const timer = setTimeout(() => {
      updateProject(id, { params });
    }, 500);
    return () => clearTimeout(timer);
  }, [id, params, updateProject]);

  // 方案配置变更 debounce 落库
  useEffect(() => {
    if (!id) return;
    const timer = setTimeout(() => {
      updateProject(id, { scenarios });
    }, 500);
    return () => clearTimeout(timer);
  }, [id, scenarios, updateProject]);

  if (!project) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Title level={4}>{t('project.notFound')}</Title>
        <Button onClick={() => navigate('/')}>{t('project.back')}</Button>
      </div>
    );
  }

  const tabItems = [
    { key: 'inputs', label: t('nav.inputs'), children: <InputsPanel /> },
    { key: 'sizing', label: t('nav.sizing'), children: <SizingPanel /> },
    { key: 'results', label: t('nav.results'), children: <ResultsPanel /> },
    { key: 'finance', label: t('nav.finance'), children: <FinancePanel /> },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>
          {t('project.back')}
        </Button>
        <Title level={4} style={{ margin: 0 }}>{project.name}</Title>
      </Space>

      {syncState === 'offline' && (
        <Alert
          type="warning"
          showIcon
          message={t('sync.offline')}
          style={{ marginBottom: 16 }}
        />
      )}

      <Tabs defaultActiveKey="inputs" items={tabItems} />
    </div>
  );
}
