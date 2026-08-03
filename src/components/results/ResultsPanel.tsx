import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Select, Row, Col, Table, Statistic, Spin, Typography, Empty, Radio } from 'antd';
import ReactECharts from 'echarts-for-react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { useParamsStore } from '../../store/useParamsStore';
import { useProfileStore } from '../../store/useProfileStore';
import { EngineMonthResult } from '../../engine/types';

const { Text } = Typography;

export default function ResultsPanel() {
  const { t } = useTranslation();
  const MONTHS = (t('results.months', { returnObjects: true }) as string[]) || ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

  const { results, scenarios, isRunning } = useSimulationStore();
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

  // ─── 日尺度：典型日调度曲线 ───
  const getDispatchChartOption = () => {
    if (!monthResult) return {};

    const intervals = monthResult.intervals;
    const times = intervals.map((_, i) => {
      const h = Math.floor(i / 4);
      const m = (i % 4) * 15;
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    });

    return {
      title: { text: `${MONTHS[selectedMonth - 1]} ${t('results.dispatch')}`, left: 'center' },
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0, data: [t('results.load'), t('results.pvGen'), t('results.bessCharge'), t('results.bessDischarge'), t('results.gridImport'), t('results.dieselGen'), t('results.soc')] },
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
          name: t('results.soc'),
          position: 'right',
          min: 0,
          max: 1,
          axisLabel: { formatter: (v: number) => `${(v * 100).toFixed(0)}%` },
        },
      ],
      series: [
        {
          name: t('results.load'), type: 'line', data: intervals.map(d => +(d.netLoad + d.pvGen).toFixed(2)),
          lineStyle: { color: '#8c8c8c', width: 2, type: 'dashed' }, itemStyle: { color: '#8c8c8c' },
          markLine: {
            silent: true,
            symbol: 'none',
            data: [{ yAxis: params.grid.contractDemand_kW, label: { formatter: `${t('results.demandLine')} ${params.grid.contractDemand_kW}kW`, position: 'insideEndTop' } }],
            lineStyle: { color: '#fa541c', type: 'dotted', width: 2 },
          },
        },
        {
          name: t('results.pvGen'), type: 'line', data: intervals.map(d => d.pvGen),
          lineStyle: { color: '#faad14' }, itemStyle: { color: '#faad14' },
          areaStyle: { color: 'rgba(250,173,20,0.2)' },
        },
        {
          name: t('results.bessCharge'), type: 'line', data: intervals.map(d => d.bessCharge),
          lineStyle: { color: '#52c41a' }, itemStyle: { color: '#52c41a' },
        },
        {
          name: t('results.bessDischarge'), type: 'line', data: intervals.map(d => -d.bessDischarge),
          lineStyle: { color: '#1890ff' }, itemStyle: { color: '#1890ff' },
        },
        {
          name: t('results.gridImport'), type: 'line', data: intervals.map(d => d.gridImport),
          lineStyle: { color: '#ff4d4f' }, itemStyle: { color: '#ff4d4f' },
        },
        {
          name: t('results.dieselGen'), type: 'line', data: intervals.map(d => d.dieselGen),
          lineStyle: { color: '#722ed1' }, itemStyle: { color: '#722ed1' },
        },
        {
          name: t('results.soc'), type: 'line', yAxisIndex: 1, data: intervals.map(d => d.socEnd),
          lineStyle: { color: '#13c2c2', width: 3 }, itemStyle: { color: '#13c2c2' },
        },
      ],
    };
  };

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

  // ─── Sankey 能量流图 ───
  const getSankeyOption = () => {
    const annual = scenarioResult?.annual;
    if (!annual) return {};

    const pv = annual.pv_kWh || 0;
    const grid = annual.gridImport_kWh || 0;
    const bessDischarge = monthlyTotals.reduce((s, m) => s + m.totals.bessDischarge_kWh, 0);
    const bessCharge = monthlyTotals.reduce((s, m) => s + m.totals.bessCharge_kWh, 0);
    const dieselKWh = monthlyTotals.reduce((s, m) => s + m.totals.diesel_kWh, 0);
    const curtail = annual.curtailment_kWh || 0;
    const totalLoad = annual.load_kWh || 0;
    const pvToLoad = Math.min(pv - curtail, totalLoad);
    const loss = Math.max(bessCharge - bessDischarge, 0);

    const nodes = [
      { name: t('results.sankey.pvGen') },
      { name: t('results.sankey.gridImport') },
      { name: t('results.sankey.bessDischarge') },
      { name: t('results.sankey.dieselGen') },
      { name: t('results.sankey.toLoad') },
      { name: t('results.sankey.toBess') },
      { name: t('results.sankey.curtailment') },
      { name: t('results.sankey.loss') },
    ];

    const links = [
      { source: t('results.sankey.pvGen'), target: t('results.sankey.toLoad'), value: +Math.max(pvToLoad, 0).toFixed(0) },
      { source: t('results.sankey.pvGen'), target: t('results.sankey.toBess'), value: +bessCharge.toFixed(0) },
      { source: t('results.sankey.pvGen'), target: t('results.sankey.curtailment'), value: +curtail.toFixed(0) },
      { source: t('results.sankey.gridImport'), target: t('results.sankey.toLoad'), value: +grid.toFixed(0) },
      { source: t('results.sankey.bessDischarge'), target: t('results.sankey.toLoad'), value: +bessDischarge.toFixed(0) },
      { source: t('results.sankey.dieselGen'), target: t('results.sankey.toLoad'), value: +dieselKWh.toFixed(0) },
      { source: t('results.sankey.toBess'), target: t('results.sankey.loss'), value: +loss.toFixed(0) },
    ].filter(l => l.value > 0);

    return {
      title: { text: t('results.sankey.title'), left: 'center' },
      tooltip: { trigger: 'item' },
      series: [
        {
          type: 'sankey',
          layout: 'none',
          emphasis: { focus: 'adjacency' },
          data: nodes,
          links,
          label: { position: 'right' },
          lineStyle: { color: 'gradient', curveness: 0.5 },
        },
      ],
    };
  };

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

  // ─── 月度节省费用（电费 + 柴油费，相对纯电网基准） ───
  const getMonthlySavingOption = () => {
    const avgPrice = params.grid.tariffType === 'flat'
      ? params.grid.flatPrice_perkWh
      : (params.grid.offPeakPrice_perkWh * 0.7 + params.grid.peakPrice_perkWh * 0.3);
    const gridSaving = monthlyTotals.map(m => +((m.totals.load_kWh - m.totals.grid_kWh) * avgPrice).toFixed(0));
    // 电网可用时基准柴油=0，方案柴油消耗记为负节省
    const dieselSaving = monthlyTotals.map(m => +(-(m.totals.dieselFuel_L || 0) * params.diesel.fuelPrice_perL).toFixed(0));

    return {
      title: { text: t('results.monthlySaving'), left: 'center' },
      tooltip: { trigger: 'axis', valueFormatter: (v: any) => `${v} ${params.currency.symbol}` },
      legend: { bottom: 0, data: [t('results.saving.grid'), t('results.saving.diesel')] },
      grid: { left: 70, right: 30, top: 50, bottom: 40 },
      xAxis: { type: 'category', data: MONTHS },
      yAxis: { type: 'value', name: params.currency.symbol },
      series: [
        { name: t('results.saving.grid'), type: 'bar', stack: 'saving', data: gridSaving, itemStyle: { color: '#52c41a' } },
        { name: t('results.saving.diesel'), type: 'bar', stack: 'saving', data: dieselSaving, itemStyle: { color: '#fa8c16' } },
      ],
    };
  };

  // ─── 方案对比表格 ───
  const comparisonColumns = [
    { title: t('common.metric'), dataIndex: 'label', key: 'label', width: 160, fixed: 'left' as const },
    ...scenarios.map(s => ({
      title: s.name,
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
          suffix="千L" precision={1} />
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
              options={scenarios.map(s => ({ value: s.id, label: s.name }))} />
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
