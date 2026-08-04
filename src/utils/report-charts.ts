/**
 * 报告/面板共享的 ECharts option 纯函数 builder。
 * 从 ResultsPanel / FinancePanel 抽取，口径单一，避免双份实现漂移。
 * 全部不依赖 React，可在任意面板与报告页复用。
 */
import { TFunction } from 'i18next';
import { EngineMonthResult, EngineAnnualSummary } from '../engine/types';
import { InputParams } from '../types/params';
import { FinanceResult } from '../types/finance';

/** 典型日 15min 调度曲线（负荷/PV/充放/购电/柴油/SOC + 合同需量线） */
export function buildDispatchOption(
  t: TFunction,
  monthResult: EngineMonthResult | undefined,
  contractDemand_kW: number,
  monthLabel: string,
) {
  if (!monthResult) return {};

  const intervals = monthResult.intervals;
  const times = intervals.map((_, i) => {
    const h = Math.floor(i / 4);
    const m = (i % 4) * 15;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  });

  return {
    title: { text: `${monthLabel} ${t('results.dispatch')}`, left: 'center' },
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0, data: [t('results.load'), t('results.pvGen'), t('results.bessCharge'), t('results.bessDischarge'), t('results.gridImport'), t('results.dieselGen'), t('results.soc')] },
    grid: { left: 60, right: 60, top: 50, bottom: 40 },
    xAxis: {
      type: 'category',
      data: times,
      axisLabel: { interval: 15, rotate: 45, fontSize: 10 },
    },
    yAxis: [
      { type: 'value', name: 'kW', position: 'left' },
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
          data: [{ yAxis: contractDemand_kW, label: { formatter: `${t('results.demandLine')} ${contractDemand_kW}kW`, position: 'insideEndTop' } }],
          lineStyle: { color: '#fa541c', type: 'dotted', width: 2 },
        },
      },
      {
        name: t('results.pvGen'), type: 'line', data: intervals.map(d => d.pvGen),
        lineStyle: { color: '#faad14' }, itemStyle: { color: '#faad14' },
        areaStyle: { color: 'rgba(250,173,20,0.2)' },
      },
      { name: t('results.bessCharge'), type: 'line', data: intervals.map(d => d.bessCharge), lineStyle: { color: '#52c41a' }, itemStyle: { color: '#52c41a' } },
      { name: t('results.bessDischarge'), type: 'line', data: intervals.map(d => -d.bessDischarge), lineStyle: { color: '#1890ff' }, itemStyle: { color: '#1890ff' } },
      { name: t('results.gridImport'), type: 'line', data: intervals.map(d => d.gridImport), lineStyle: { color: '#ff4d4f' }, itemStyle: { color: '#ff4d4f' } },
      { name: t('results.dieselGen'), type: 'line', data: intervals.map(d => d.dieselGen), lineStyle: { color: '#722ed1' }, itemStyle: { color: '#722ed1' } },
      { name: t('results.soc'), type: 'line', yAxisIndex: 1, data: intervals.map(d => d.socEnd), lineStyle: { color: '#13c2c2', width: 3 }, itemStyle: { color: '#13c2c2' } },
    ],
  };
}

/** 月度节省费用堆叠柱（电费节省 + 柴油负节省，相对纯电网基准） */
export function buildMonthlySavingOption(
  t: TFunction,
  monthlyResults: EngineMonthResult[],
  params: InputParams,
  months: string[],
) {
  const avgPrice = params.grid.tariffType === 'flat'
    ? params.grid.flatPrice_perkWh
    : (params.grid.offPeakPrice_perkWh * 0.7 + params.grid.peakPrice_perkWh * 0.3);
  const gridSaving = monthlyResults.map(m => +((m.totals.load_kWh - m.totals.grid_kWh) * avgPrice).toFixed(0));
  // 电网可用时基准柴油=0，方案柴油消耗记为负节省
  const dieselSaving = monthlyResults.map(m => +(-(m.totals.dieselFuel_L || 0) * params.diesel.fuelPrice_perL).toFixed(0));

  return {
    title: { text: t('results.monthlySaving'), left: 'center' },
    tooltip: { trigger: 'axis', valueFormatter: (v: any) => `${v} ${params.currency.symbol}` },
    legend: { bottom: 0, data: [t('results.saving.grid'), t('results.saving.diesel')] },
    grid: { left: 70, right: 30, top: 50, bottom: 40 },
    xAxis: { type: 'category', data: months },
    yAxis: { type: 'value', name: params.currency.symbol },
    series: [
      { name: t('results.saving.grid'), type: 'bar', stack: 'saving', data: gridSaving, itemStyle: { color: '#52c41a' } },
      { name: t('results.saving.diesel'), type: 'bar', stack: 'saving', data: dieselSaving, itemStyle: { color: '#fa8c16' } },
    ],
  };
}

/** 年能量流 Sankey（8 节点 7 边；损耗=充电−放电，即 RTE 损耗） */
export function buildSankeyOption(
  t: TFunction,
  annual: EngineAnnualSummary | undefined,
  monthlyResults: EngineMonthResult[],
) {
  if (!annual) return {};

  const pv = annual.pv_kWh || 0;
  const grid = annual.gridImport_kWh || 0;
  const bessDischarge = monthlyResults.reduce((s, m) => s + m.totals.bessDischarge_kWh, 0);
  const bessCharge = monthlyResults.reduce((s, m) => s + m.totals.bessCharge_kWh, 0);
  const dieselKWh = monthlyResults.reduce((s, m) => s + m.totals.diesel_kWh, 0);
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
}

/** 累计折现现金流曲线（含回收点 0 轴标线） */
export function buildCumCashflowOption(t: TFunction, fin: FinanceResult) {
  return {
    title: { text: `${t('params.scheme')} ${fin.scenarioId} ${t('finance.cashflowChart')}`, left: 'center' },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: fin.cashflow.map(r => `Y${r.year}`) },
    yAxis: { type: 'value', name: t('finance.chart.cumulativeCashflow') },
    series: [
      {
        name: t('finance.cashflowChart'),
        type: 'line',
        data: fin.cashflow.map(r => r.cumulativeDiscountedCF),
        markLine: {
          data: [{ yAxis: 0, label: { formatter: t('finance.paybackPoint') } }],
          lineStyle: { color: '#ff4d4f', type: 'dashed' },
        },
        areaStyle: { color: 'rgba(22,119,255,0.1)' },
      },
    ],
    grid: { left: 60, right: 20, top: 40, bottom: 30 },
  };
}
