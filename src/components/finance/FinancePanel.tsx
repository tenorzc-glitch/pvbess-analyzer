import { Card, Row, Col, Table, Statistic, Spin, Empty, Typography } from 'antd';
import ReactECharts from 'echarts-for-react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { useFinanceStore } from '../../store/useFinanceStore';
import { FinanceResult } from '../../types/finance';

const { Title, Text } = Typography;

export default function FinancePanel() {
  const { results, isRunning: simRunning } = useSimulationStore();
  const { results: financeResults, isRunning: finRunning } = useFinanceStore();

  const isRunning = simRunning || finRunning;

  if (isRunning) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin size="large" />
        <Text style={{ display: 'block', marginTop: 16 }}>正在计算财务指标...</Text>
      </div>
    );
  }

  if (!financeResults || financeResults.length === 0) {
    return <Empty description="暂无财务数据，请先运行仿真" />;
  }

  // 找到最优方案（NPV 最大）
  const bestResult = financeResults.reduce((a, b) => a.npv > b.npv ? a : b);

  // ─── NPV 对比柱状图 ───
  const npvChartOption = {
    title: { text: 'NPV 对比（5 方案）', left: 'center' },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: financeResults.map(r => `方案${r.scenarioId}`),
    },
    yAxis: { type: 'value', name: '净现值' },
    series: [{
      type: 'bar',
      data: financeResults.map(r => ({
        value: r.npv,
        itemStyle: {
          color: r.scenarioId === bestResult.scenarioId ? '#1677ff' : '#91caff',
        },
      })),
      label: {
        show: true,
        position: 'top',
        formatter: (p: any) => `${(p.value / 1000).toFixed(0)}k`,
      },
    }],
    grid: { left: 60, right: 20, top: 40, bottom: 30 },
  };

  // ─── 累计现金流图 ───
  const cashflowChartOption = {
    title: { text: `方案${bestResult.scenarioId} 累计折现现金流`, left: 'center' },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: bestResult.cashflow.map(r => `Y${r.year}`),
    },
    yAxis: { type: 'value', name: '累计现金流' },
    series: [
      {
        name: '累计折现现金流',
        type: 'line',
        data: bestResult.cashflow.map(r => r.cumulativeDiscountedCF),
        markLine: {
          data: [{ yAxis: 0, label: { formatter: '回收点' } }],
          lineStyle: { color: '#ff4d4f', type: 'dashed' },
        },
        areaStyle: { color: 'rgba(22,119,255,0.1)' },
      },
    ],
    grid: { left: 60, right: 20, top: 40, bottom: 30 },
  };

  // ─── 财务对比表 ───
  const financeColumns = [
    { title: '指标', dataIndex: 'label', key: 'label', width: 160, fixed: 'left' as const },
    ...financeResults.map(r => ({
      title: `方案${r.scenarioId}`,
      dataIndex: `s${r.scenarioId}`,
      key: `s${r.scenarioId}`,
      align: 'right' as const,
    })),
  ];

  const formatMoney = (v: number) => {
    const abs = Math.abs(v);
    if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
    return v.toFixed(0);
  };

  const financeData = [
    {
      label: 'CAPEX',
      ...Object.fromEntries(financeResults.map(r => [`s${r.scenarioId}`, formatMoney(r.capex)])),
    },
    {
      label: '首年收益',
      ...Object.fromEntries(financeResults.map(r => [`s${r.scenarioId}`, formatMoney(r.annualRevenue)])),
    },
    {
      label: 'NPV',
      ...Object.fromEntries(financeResults.map(r => [`s${r.scenarioId}`, formatMoney(r.npv)])),
    },
    {
      label: 'IRR',
      ...Object.fromEntries(financeResults.map(r => [`s${r.scenarioId}`, `${(r.irr * 100).toFixed(1)}%`])),
    },
    {
      label: '静态回收期 (年)',
      ...Object.fromEntries(financeResults.map(r => [`s${r.scenarioId}`, r.paybackStatic.toFixed(2)])),
    },
    {
      label: '动态回收期 (年)',
      ...Object.fromEntries(financeResults.map(r => [`s${r.scenarioId}`, r.paybackDynamic.toFixed(2)])),
    },
    {
      label: 'LCOE',
      ...Object.fromEntries(financeResults.map(r => [`s${r.scenarioId}`, r.lcoe.toFixed(2)])),
    },
    {
      label: 'B/C Ratio',
      ...Object.fromEntries(financeResults.map(r => [`s${r.scenarioId}`, r.benefitCostRatio.toFixed(2)])),
    },
  ];

  return (
    <div>
      {/* 最优方案 KPI */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}>
          <Card size="small">
            <Statistic title="推荐方案" value={`方案${bestResult.scenarioId}`} />
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small">
            <Statistic title="NPV" value={bestResult.npv} precision={0}
              prefix={bestResult.npv >= 0 ? '+' : ''} />
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small">
            <Statistic title="IRR" value={(bestResult.irr * 100).toFixed(1)} suffix="%" />
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small">
            <Statistic title="静态回收期" value={bestResult.paybackStatic.toFixed(2)} suffix="年" />
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small">
            <Statistic title="B/C Ratio" value={bestResult.benefitCostRatio.toFixed(2)} />
          </Card>
        </Col>
      </Row>

      {/* NPV 柱状图 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <ReactECharts option={npvChartOption} style={{ height: 300 }} />
      </Card>

      {/* 累计现金流 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <ReactECharts option={cashflowChartOption} style={{ height: 300 }} />
      </Card>

      {/* 财务指标汇总表 */}
      <Card size="small" title="财务指标汇总">
        <Table
          dataSource={financeData.map((d, i) => ({ ...d, key: i }))}
          columns={financeColumns}
          pagination={false}
          size="small"
          scroll={{ x: 800 }}
        />
      </Card>
    </div>
  );
}
