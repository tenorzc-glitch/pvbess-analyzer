import { useState } from 'react';
import { Card, Select, Row, Col, Table, Statistic, Spin, Typography, Empty } from 'antd';
import ReactECharts from 'echarts-for-react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { EngineMonthResult } from '../../engine/types';

const { Title, Text } = Typography;

const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

export default function ResultsPanel() {
  const { results, scenarios, isRunning } = useSimulationStore();
  const [selectedScenario, setSelectedScenario] = useState(4);
  const [selectedMonth, setSelectedMonth] = useState(1);

  if (isRunning) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin size="large" />
        <Text style={{ display: 'block', marginTop: 16 }}>正在运行仿真计算...</Text>
      </div>
    );
  }

  if (!results || results.length === 0) {
    return <Empty description="暂无仿真结果，请先配置参数" />;
  }

  const scenarioResult = results.find(r => r.scenarioId === selectedScenario);
  const monthResult = scenarioResult?.monthlyResults.find(m => m.month === selectedMonth);

  // ─── 调度曲线图 ───
  const getDispatchChartOption = () => {
    if (!monthResult) return {};

    const intervals = monthResult.intervals;
    const times = intervals.map((_, i) => {
      const h = Math.floor(i / 4);
      const m = (i % 4) * 15;
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    });

    return {
      title: { text: `${MONTHS[selectedMonth - 1]} 典型日调度曲线`, left: 'center' },
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0, data: ['光伏发电', '电池充电', '电池放电', '电网购电', '柴油发电', 'SOC'] },
      grid: { left: 60, right: 60, top: 50, bottom: 40 },
      xAxis: {
        type: 'category',
        data: times,
        axisLabel: {
          interval: 15,
          rotate: 45,
          fontSize: 10,
        },
      },
      yAxis: [
        {
          type: 'value',
          name: 'kW',
          position: 'left',
        },
        {
          type: 'value',
          name: 'SOC',
          position: 'right',
          min: 0,
          max: 1,
          axisLabel: { formatter: (v: number) => `${(v * 100).toFixed(0)}%` },
        },
      ],
      series: [
        {
          name: '光伏发电', type: 'line', data: intervals.map(d => d.pvGen),
          lineStyle: { color: '#faad14' }, itemStyle: { color: '#faad14' },
          areaStyle: { color: 'rgba(250,173,20,0.2)' },
        },
        {
          name: '电池充电', type: 'line', data: intervals.map(d => d.bessCharge),
          lineStyle: { color: '#52c41a' }, itemStyle: { color: '#52c41a' },
        },
        {
          name: '电池放电', type: 'line', data: intervals.map(d => -d.bessDischarge),
          lineStyle: { color: '#1890ff' }, itemStyle: { color: '#1890ff' },
        },
        {
          name: '电网购电', type: 'line', data: intervals.map(d => d.gridImport),
          lineStyle: { color: '#ff4d4f' }, itemStyle: { color: '#ff4d4f' },
        },
        {
          name: '柴油发电', type: 'line', data: intervals.map(d => d.dieselGen),
          lineStyle: { color: '#722ed1' }, itemStyle: { color: '#722ed1' },
        },
        {
          name: 'SOC', type: 'line', yAxisIndex: 1, data: intervals.map(d => d.socEnd),
          lineStyle: { color: '#13c2c2', width: 3 }, itemStyle: { color: '#13c2c2' },
        },
      ],
    };
  };

  // ─── 5 方案对比表格 ───
  const comparisonColumns = [
    { title: '指标', dataIndex: 'label', key: 'label', width: 160, fixed: 'left' as const },
    ...scenarios.map(s => ({
      title: s.name,
      dataIndex: `s${s.id}`,
      key: `s${s.id}`,
      align: 'right' as const,
    })),
  ];

  const comparisonData = [
    {
      label: '储能容量 (kWh)',
      ...Object.fromEntries(scenarios.map(s => [`s${s.id}`, s.bessCapacity_kWh])),
    },
    {
      label: '年光伏发电 (MWh)',
      ...Object.fromEntries(results.map(r => [`s${r.scenarioId}`, (r.annual.pv_kWh / 1000).toFixed(0)])),
    },
    {
      label: '年电网购电 (MWh)',
      ...Object.fromEntries(results.map(r => [`s${r.scenarioId}`, (r.annual.gridImport_kWh / 1000).toFixed(0)])),
    },
    {
      label: '年弃光 (MWh)',
      ...Object.fromEntries(results.map(r => [`s${r.scenarioId}`, (r.annual.curtailment_kWh / 1000).toFixed(0)])),
    },
    {
      label: '弃光率',
      ...Object.fromEntries(results.map(r => [`s${r.scenarioId}`, `${(r.annual.curtailment_kWh / Math.max(r.annual.pv_kWh, 1) * 100).toFixed(1)}%`])),
    },
    {
      label: '年柴油消耗 (千L)',
      ...Object.fromEntries(results.map(r => [`s${r.scenarioId}`, (r.annual.dieselFuel_L / 1000).toFixed(1)])),
    },
    {
      label: '最大需量 (kW)',
      ...Object.fromEntries(results.map(r => [`s${r.scenarioId}`, r.annual.peakDemand_kW.toFixed(0)])),
    },
    {
      label: 'BESS 循环次数',
      ...Object.fromEntries(results.map(r => [`s${r.scenarioId}`, r.annual.bessCycles.toFixed(0)])),
    },
    {
      label: '年能源成本',
      ...Object.fromEntries(results.map(r => [`s${r.scenarioId}`, `${(r.annual.totalEnergyCost / 1000).toFixed(1)}k`])),
    },
  ];

  return (
    <div>
      {/* KPI 卡片 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic title="年光伏发电" value={(scenarioResult?.annual.pv_kWh || 0) / 1000}
              suffix="MWh" precision={1} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="年电网购电" value={(scenarioResult?.annual.gridImport_kWh || 0) / 1000}
              suffix="MWh" precision={1} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="弃光率"
              value={scenarioResult ? (scenarioResult.annual.curtailment_kWh / Math.max(scenarioResult.annual.pv_kWh, 1) * 100) : 0}
              suffix="%" precision={1} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="年柴油消耗" value={(scenarioResult?.annual.dieselFuel_L || 0) / 1000}
              suffix="千L" precision={1} />
          </Card>
        </Col>
      </Row>

      {/* 调度曲线 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16} style={{ marginBottom: 8 }}>
          <Col>
            <Select value={selectedScenario} onChange={setSelectedScenario} style={{ width: 200 }}
              options={scenarios.map(s => ({ value: s.id, label: s.name }))} />
          </Col>
          <Col>
            <Select value={selectedMonth} onChange={setSelectedMonth} style={{ width: 120 }}
              options={MONTHS.map((m, i) => ({ value: i + 1, label: m }))} />
          </Col>
        </Row>
        <ReactECharts option={getDispatchChartOption()} style={{ height: 380 }} />
      </Card>

      {/* 5 方案对比表 */}
      <Card size="small" title="5 方案对比">
        <Table
          dataSource={comparisonData.map((d, i) => ({ ...d, key: i }))}
          columns={comparisonColumns}
          pagination={false}
          size="small"
          scroll={{ x: 800 }}
        />
      </Card>
    </div>
  );
}
