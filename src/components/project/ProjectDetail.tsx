import { useParams, useNavigate } from 'react-router-dom';
import { Tabs, Typography, Button, Space } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useProjectStore } from '../../store/useProjectStore';
import { useSimulation } from '../../hooks/useSimulation';
import InputsPanel from '../inputs/InputsPanel';
import SizingPanel from '../sizing/SizingPanel';
import ResultsPanel from '../results/ResultsPanel';
import FinancePanel from '../finance/FinancePanel';

const { Title } = Typography;

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const projects = useProjectStore((s) => s.projects);
  const project = projects.find((p) => p.id === id);

  useSimulation();

  if (!project) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Title level={4}>项目未找到</Title>
        <Button onClick={() => navigate('/')}>返回项目列表</Button>
      </div>
    );
  }

  const tabItems = [
    { key: 'inputs', label: '参数输入', children: <InputsPanel /> },
    { key: 'sizing', label: '定容寻优', children: <SizingPanel /> },
    { key: 'results', label: '仿真结果', children: <ResultsPanel /> },
    { key: 'finance', label: '财务分析', children: <FinancePanel /> },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>
          返回
        </Button>
        <Title level={4} style={{ margin: 0 }}>{project.name}</Title>
      </Space>

      <Tabs defaultActiveKey="inputs" items={tabItems} />
    </div>
  );
}
