import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Select, Row, Col, Table, Statistic, Spin, Typography, Empty, Radio } from 'antd';
import ReactECharts from 'echarts-for-react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { useParamsStore } from '../../store/useParamsStore';
import { useProfileStore } from '../../store/useProfileStore';
import { EngineMonthResult } from '../../engine/types';
import { scenarioDisplayName } from '../../utils/scenario-name';
import { buildDispatchOption, buildMonthlySavingOption, buildSankeyOption } from '../../utils/report-charts';

const { Text } = Typography;

export default function ResultsPanel() {
  const { t } = useTranslation();
  const MONTHS = (t('results.months', { returnObjects: true }) as string[]) || ['1','2','3','4','5','6','7','8','9','10','11','12'];

  const { results, scenarios, isRunning, baselines } = useSimulationStore();
  const { params } = useParamsStore();
  const { profile } = useProfileStore();
  const [selectedScenario, setSelectedScenario] = useState(4);
  const [selectedMonth, setSelectedMonth] = useState(1);
  const [timeScale, setTimeScale] = useState<'day' | 'month' | 'year'>('day');

  if (isRunning) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin size="large" />
        <Text style={{ display: 'block', marginTop: 16 }}>{t('results.running')}</Text>
      </div>
    );
  }

  if (!results || results.length === 0) {
    return <Empty description={t('results.noData')} />;
  }

  const scenarioResult = results.find(r => r.scenarioId === selectedScenario);
  const monthResult = scenarioResult?.monthlyResults?.find(m => m.month === selectedMonth);

  // 汇总 12 个月的总量，用于多时间尺度图表与 KPI 计算
  const monthlyTotals = scenarioResult?.monthlyResults ?? [];
  const totalUnserved = monthlyTotals.reduce((sum, m) => sum + (m.totals.unserved_kWh || 0), 0);

  // ─── 日尺度：典型日调度曲线（option builder 已抽取至 report-charts.ts） ───
  const getDispatchChartOption = () =>
    buildDispatchOption(t, monthResult, params.grid.contractDemand_kW, MONTHS[selectedMonth - 1]);

  // ─── 月尺度：12 个月汇总柱状图 ───
  const getMonthChartOption = () => {
    const data = monthlyTotals;
    return {
      title: { text: t('results.timeScale.month'), left: 'center' },
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0, data: [t('results.pvGen'), t('results.gridImport'), t('results.bessDischarge'), t('results.dieselGen')] },
      grid: { left: 60, right: 30, top: 50, bottom: 40 },
      xAxis: {
        type: 'category',
        data: MONTHS,
      },
      yAxis: { type: 'value', name: 'kWh' },
      series: [
        {
          name: t('results.pvGen'), type: 'bar', data: data.map(m => +(m.totals.pv_kWh).toFixed(1)),
          itemStyle: { color: '#faad14' },
        },
        {
          name: t('results.gridImport'), type: 'bar', data: data.map(m => +(m.totals.grid_kWh).toFixed(1)),
          itemStyle: { color: '#ff4d4f' },
        },
        {
          name: t('results.bessDischarge'), type: 'bar', data: data.map(m => +(m.totals.bessDischarge_kWh).toFixed(1)),
          itemStyle: { color: '#1890ff' },
        },
        {
          name: t('results.dieselGen'), type: 'bar', data: data.map(m => +(m.totals.diesel_kWh).toFixed(1)),
          itemStyle: { color: '#722ed1' },
        },
      ],
    };
  };

  // ─── 年尺度：全年汇总饼图 ───
  const getYearChartOption = () => {
    const annual = scenarioResult?.annual;
    if (!annual) return {};

    const totalLoad = annual.load_kWh || 1;
    const pv = annual.pv_kWh - annual.curtailment_kWh; // 净光伏
    const grid = annual.gridImport_kWh;
    const dieselKWh = monthlyTotals.reduce((s, m) => s + m.totals.diesel_kWh, 0);
    const bessDischarge = monthlyTotals.reduce((s, m) => s + m.totals.bessDischarge_kWh, 0);

    return {
      title: { text: t('results.timeScale.year'), left: 'center' },
      tooltip: { trigger: 'item', formatter: '{b}: {c} kWh ({d}%)' },
      legend: { bottom: 0 },
      series: [
        {
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['50%', '50%'],
          data: [
            { value: +Math.max(pv, 0).toFixed(0), name: t('results.pvGen'), itemStyle: { color: '#faad14' } },
            { value: +grid.toFixed(0), name: t('results.gridImport'), itemStyle: { color: '#ff4d4f' } },
            { value: +bessDischarge.toFixed(0), name: t('results.bessDischarge'), itemStyle: { color: '#1890ff' } },
            { value: +dieselKWh.toFixed(0), name: t('results.dieselGen'), itemStyle: { color: '#722ed1' } },
          ],
          label: { formatter: '{b}\n{d}%' },
        },
      ],
    };
  };

  const getDispatchOption = () => {
    if (timeScale === 'month') return getMonthChartOption();
    if (timeScale === 'year') return getYearChartOption();
    return getDispatchChartOption();
  };

  // ─── Sankey 能量流图（option builder 已抽取至 report-charts.ts） ───
  const getSankeyOption = () => buildSankeyOption(t, scenarioResult?.annual, monthlyTotals);

  // ─── 分时电价曲线（所选月份，96 个 15min 点） ───
  const getTouChartOption = () => {
    const monthProfile = profile?.[selectedMonth - 1] ?? [];
    const times = Array.from({ length: 96 }, (_, i) => {
      const h = Math.floor(i / 4);
      const m = (i % 4) * 15;
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    });
    // flat 模式用统一电价；tou 模式优先用 profile 中的分时电价
    const prices = monthProfile.length === 96
      ? monthProfile.map(p => p.gridPrice)
      : Array(96).fill(params.grid.tariffType === 'flat' ? params.grid.flatPrice_perkWh : params.grid.offPeakPrice_perkWh);

    return {
      title: { text: `${MONTHS[selectedMonth - 1]} ${t('results.touPrice')}`, left: 'center' },
      tooltip: { trigger: 'axis', valueFormatter: (v: any) => `${v} ${params.currency.symbol}/kWh` },
      grid: { left: 60, right: 30, top: 50, bottom: 40 },
      xAxis: { type: 'category', data: times, axisLabel: { interval: 15, rotate: 45, fontSize: 10 } },
      yAxis: { type: 'value', name: `${params.currency.symbol}/kWh` },
      series: [{
        type: 'line',
        data: prices,
        step: 'end',
        lineStyle: { color: '#fa541c', width: 2 },
        itemStyle: { color: '#fa541c' },
        areaStyle: { color: 'rgba(250,84,28,0.15)' },
        markLine: params.grid.tariffType === 'tou' ? {
          silent: true, symbol: 'none',
          data: [
            { yAxis: params.grid.peakPrice_perkWh, label: { formatter: `${t('params.peakPrice')} ${params.grid.peakPrice_perkWh}`, position: 'insideEndTop' }, lineStyle: { color: '#ff4d4f', type: 'dashed' } },
            { yAxis: params.grid.offPeakPrice_perkWh, label: { formatter: `${t('params.offPeakPrice')} ${params.grid.offPeakPrice_perkWh}`, position: 'insideEndBottom' }, lineStyle: { color: '#52c41a', type: 'dashed' } },
          ],
        } : undefined,
      }],
    };
  };

  // ─── 月度节省费用（option builder 已抽取至 report-charts.ts；baseline 供需量差月度口径） ───
  const baseline = baselines?.[0] ?? null;
  const getMonthlySavingOption = () => buildMonthlySavingOption(t, monthlyTotals, params, MONTHS, baseline);

  // ─── 方案对比表格 ───
  const comparisonColumns = [
    { title: t('common.metric'), dataIndex: 'label', key: 'label', width: 160, fixed: 'left' as const },
    ...scenarios.map(s => ({
      title: scenarioDisplayName(s, t),
      dataIndex: `s${s.id}`,
      key: `s${s.id}`,
      align: 'right' as const,
    })),
  ];

  const comparisonData = [
    {
      label: t('params.bessCapacity'),
      ...Object.fromEntries(scenarios.map(s => [`s${s.id}`, s.bessCapacity_kWh])),
    },
    {
      label: t('results.compare.pv'),
      ...Object.fromEntries(results.map(r => [`s${r.scenarioId}`, (r.annual.pv_kWh / 1000).toFixed(0)])),
    },
    {
      label: t('results.compare.grid'),
      ...Object.fromEntries(results.map(r => [`s${r.scenarioId}`, (r.annual.gridImport_kWh / 1000).toFixed(0)])),
    },
    {
      label: t('results.compare.curtail'),
      ...Object.fromEntries(results.map(r => [`s${r.scenarioId}`, (r.annual.curtailment_kWh / 1000).toFixed(0)])),
    },
    {
      label: t('results.compare.curtailRate'),
      ...Object.fromEntries(results.map(r => [`s${r.scenarioId}`, `${(r.annual.curtailment_kWh / Math.max(r.annual.pv_kWh, 1) * 100).toFixed(1)}%`])),
    },
    {
      label: t('results.compare.diesel'),
      ...Object.fromEntries(results.map(r => [`s${r.scenarioId}`, (r.annual.dieselFuel_L / 1000).toFixed(1)])),
    },
    {
      label: t('results.compare.peak'),
      ...Object.fromEntries(results.map(r => [`s${r.scenarioId}`, r.annual.peakDemand_kW.toFixed(0)])),
    },
    {
      label: t('results.compare.cycles'),
      ...Object.fromEntries(results.map(r => [`s${r.scenarioId}`, r.annual.bessCycles.toFixed(0)])),
    },
    {
      label: t('results.compare.cost'),
      ...Object.fromEntries(results.map(r => [`s${r.scenarioId}`, `${(r.annual.totalEnergyCost / 1000).toFixed(1)}k`])),
    },
  ];

  // KPI 行：基础 4 + 绿电消纳 + 绿电比例 + 储能效率 + 条件展示断电时长
  const annualPv = scenarioResult?.annual.pv_kWh || 0;
  const annualCurtail = scenarioResult?.annual.curtailment_kWh || 0;
  const annualLoad = scenarioResult?.annual.load_kWh || 0;
  const totalBessCharge = monthlyTotals.reduce((s, m) => s + (m.totals.bessCharge_kWh || 0), 0);
  const totalBessDischarge = monthlyTotals.reduce((s, m) => s + (m.totals.bessDischarge_kWh || 0), 0);
  // 绿电比例 = 光伏自用（发电-弃光）/ 总负荷
  const greenRatio = annualLoad > 0 ? Math.max(annualPv - annualCurtail, 0) / annualLoad : 0;
  // 储能综合效率 = 累计放电 / 累计充电
  const bessEfficiency = totalBessCharge > 0 ? totalBessDischarge / totalBessCharge : 0;

  const kpiCols = [
    <Col span={6} key="annualPV">
      <Card size="small">
        <Statistic title={t('results.kpi.annualPV')}
          value={annualPv / 1000}
          suffix="MWh" precision={1} />
      </Card>
    </Col>,
    <Col span={6} key="annualGrid">
      <Card size="small">
        <Statistic title={t('results.kpi.annualGrid')}
          value={(scenarioResult?.annual.gridImport_kWh || 0) / 1000}
          suffix="MWh" precision={1} />
      </Card>
    </Col>,
    <Col span={6} key="curtailRate">
      <Card size="small">
        <Statistic title={t('results.kpi.curtailRate')}
          value={annualPv > 0 ? (annualCurtail / annualPv * 100) : 0}
          suffix="%" precision={1} />
      </Card>
    </Col>,
    <Col span={6} key="annualDiesel">
      <Card size="small">
        <Statistic title={t('results.kpi.annualDiesel')}
          value={(scenarioResult?.annual.dieselFuel_L || 0) / 1000}
          suffix="kL" precision={1} />
      </Card>
    </Col>,
    <Col span={6} key="greenEnergy">
      <Card size="small">
        <Statistic title={t('results.kpi.greenEnergy')}
          value={Math.max(annualPv - annualCurtail, 0) / 1000}
          suffix="MWh" precision={1} />
      </Card>
    </Col>,
    <Col span={6} key="greenRatio">
      <Card size="small">
        <Statistic title={t('results.kpi.greenRatio')}
          value={greenRatio * 100}
          suffix="%" precision={1} />
      </Card>
    </Col>,
    <Col span={6} key="bessEfficiency">
      <Card size="small">
        <Statistic title={t('results.kpi.bessEfficiency')}
          value={bessEfficiency * 100}
          suffix="%" precision={1} />
      </Card>
    </Col>,
  ];

  if (params.outageLoss.enabled) {
    kpiCols.push(
      <Col span={6} key="outageHours">
        <Card size="small">
          <Statistic title={t('results.kpi.outageHours')}
            value={totalUnserved / 1000}
            suffix="kWh" precision={1} />
        </Card>
      </Col>,
    );
  }

  return (
    <div>
      {/* KPI 卡片 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        {kpiCols}
      </Row>

      {/* 调度曲线（多时间尺度） */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16} style={{ marginBottom: 8 }} align="middle" justify="space-between">
          <Col>
            <Select value={selectedScenario} onChange={setSelectedScenario} style={{ width: 200 }}
              options={scenarios.map(s => ({ value: s.id, label: scenarioDisplayName(s, t) }))} />
            {timeScale === 'day' && (
              <Select value={selectedMonth} onChange={setSelectedMonth} style={{ width: 120, marginLeft: 8 }}
                options={MONTHS.map((m, i) => ({ value: i + 1, label: m }))} />
            )}
          </Col>
          <Col>
            <Radio.Group value={timeScale} onChange={e => setTimeScale(e.target.value)}>
              <Radio.Button value="day">{t('results.timeScale.day')}</Radio.Button>
              <Radio.Button value="month">{t('results.timeScale.month')}</Radio.Button>
              <Radio.Button value="year">{t('results.timeScale.year')}</Radio.Button>
            </Radio.Group>
          </Col>
        </Row>
        <ReactECharts option={getDispatchOption()} style={{ height: 380 }} />
      </Card>

      {/* 分时电价（日尺度时跟随所选月份） */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <ReactECharts option={getTouChartOption()} style={{ height: 260 }} />
      </Card>

      {/* Sankey 能量流图 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <ReactECharts option={getSankeyOption()} style={{ height: 360 }} />
      </Card>

      {/* 月度节省费用 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <ReactECharts option={getMonthlySavingOption()} style={{ height: 300 }} />
      </Card>

      {/* 方案对比表 */}
      <Card size="small" title={t('results.compare.title')}>
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
