/**
 * 报告/面板共享的 ECharts option 纯函数 builder。
 * 从 ResultsPanel / FinancePanel 抽取，口径单一，避免双份实现漂移。
 * 全部不依赖 React，可在任意面板与报告页复用。
 *
 * 批次 R3（报告修改建议 8 条）：
 * - 调度图：合同需量线 → 双峰值虚线（部署前负荷峰值 / 部署后电网峰值）
 * - 月度节省图：电费/柴油两系列 → 四分量中的月度三分量堆叠（PV自用/储能套利/需量差）
 * - Sankey：更名储能充电/储能放电，新增电网→储能充电流，节点色块+K缩写标签美化
 * - 现金流图：可选 10 年口径（报告用）
 *
 * 批次 R5（报告修改意见 20260806，参考 RR 工商业案例表达形式，内容/数字不变）：
 * - 调度图：可选 loadAsBar（报告章负荷折线→柱状，结果页不受影响）
 * - 新增年度费用构成对比（横向堆叠条 + 净节省标注）
 * - 新增累计费用双线对比（不投资 vs 投资光储 + 回收点标注），替换报告投资章单线现金流图
 */
import { TFunction } from 'i18next';
import { EngineMonthResult, EngineAnnualSummary, BaselineOutput } from '../engine/types';
import { InputParams } from '../types/params';
import { FinanceResult } from '../types/finance';
import { monthlyDemandCharge } from '../engine/simulation-engine';
import { ReportFx, fmtMoneyShort } from './report-fx';

/** 典型日 15min 调度曲线（负荷/PV/充放/购电/柴油/SOC + 部署前后峰值双虚线） */
export function buildDispatchOption(
  t: TFunction,
  monthResult: EngineMonthResult | undefined,
  _contractDemand_kW: number, // 保留签名兼容；峰值线改由数据推导
  monthLabel: string,
  loadAsBar = false, // 报告用：负荷折线→柱状（参考 RR 案例风格）；结果页默认保持折线
) {
  if (!monthResult) return {};

  const intervals = monthResult.intervals;
  const times = intervals.map((_, i) => {
    const h = Math.floor(i / 4);
    const m = (i % 4) * 15;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  });

  // 部署前峰值 = 原始负荷最大需量；部署后峰值 = 实际电网购电最大需量
  const peakBefore = Math.max(...intervals.map((d) => d.netLoad + d.pvGen));
  const peakAfter = Math.max(...intervals.map((d) => d.gridImport));

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
        name: t('results.load'), type: loadAsBar ? 'bar' : 'line',
        barWidth: loadAsBar ? '60%' : undefined,
        data: intervals.map(d => +(d.netLoad + d.pvGen).toFixed(2)),
        lineStyle: loadAsBar ? undefined : { color: '#8c8c8c', width: 2, type: 'dashed' },
        itemStyle: { color: loadAsBar ? '#bfbfbf' : '#8c8c8c' },
        markLine: {
          silent: true,
          symbol: 'none',
          data: [{
            yAxis: +peakBefore.toFixed(1),
            label: { formatter: `${t('results.peakBefore')} ${peakBefore.toFixed(0)} kW`, position: 'insideEndTop', color: '#fa541c' },
          }],
          lineStyle: { color: '#fa541c', type: 'dashed', width: 2 },
        },
      },
      {
        name: t('results.pvGen'), type: 'line', data: intervals.map(d => d.pvGen),
        lineStyle: { color: '#faad14' }, itemStyle: { color: '#faad14' },
        areaStyle: { color: 'rgba(250,173,20,0.2)' },
      },
      { name: t('results.bessCharge'), type: 'line', data: intervals.map(d => d.bessCharge), lineStyle: { color: '#52c41a' }, itemStyle: { color: '#52c41a' } },
      { name: t('results.bessDischarge'), type: 'line', data: intervals.map(d => -d.bessDischarge), lineStyle: { color: '#1890ff' }, itemStyle: { color: '#1890ff' } },
      {
        name: t('results.gridImport'), type: 'line', data: intervals.map(d => d.gridImport), lineStyle: { color: '#ff4d4f' }, itemStyle: { color: '#ff4d4f' },
        markLine: {
          silent: true,
          symbol: 'none',
          data: [{
            yAxis: +peakAfter.toFixed(1),
            label: { formatter: `${t('results.peakAfter')} ${peakAfter.toFixed(0)} kW`, position: 'insideStartTop', color: '#389e0d' },
          }],
          lineStyle: { color: '#389e0d', type: 'dashed', width: 2 },
        },
      },
      { name: t('results.dieselGen'), type: 'line', data: intervals.map(d => d.dieselGen), lineStyle: { color: '#722ed1' }, itemStyle: { color: '#722ed1' } },
      { name: t('results.soc'), type: 'line', yAxisIndex: 1, data: intervals.map(d => d.socEnd), lineStyle: { color: '#13c2c2', width: 3 }, itemStyle: { color: '#13c2c2' } },
    ],
  };
}

/**
 * 月度节省堆叠柱（四分量中的月度三分量：PV 自用 / 储能套利 / 需量差；
 * 柴油差为年度口径——基线月度柴油未拆分，在节省明细表体现）
 */
export function buildMonthlySavingOption(
  t: TFunction,
  monthlyResults: EngineMonthResult[],
  params: InputParams,
  months: string[],
  baseline?: BaselineOutput | null,
) {
  const pvSelfUse = monthlyResults.map(m => +(m.totals.pvSelfUseValue || 0).toFixed(0));
  const arbitrage = monthlyResults.map(m =>
    +(((m.totals.dischargeValue || 0) - (m.totals.gridChargeCost || 0))).toFixed(0));
  const demand = monthlyResults.map((m, i) => {
    const basePeak = baseline?.monthlyPeaks_kW?.[i];
    if (basePeak == null) return 0;
    return +(monthlyDemandCharge(params, basePeak) - monthlyDemandCharge(params, m.totals.monthPeakGrid_kW || 0)).toFixed(0);
  });

  return {
    title: { text: t('results.monthlySaving'), left: 'center' },
    tooltip: { trigger: 'axis', valueFormatter: (v: any) => `${v} ${params.currency.symbol}` },
    legend: { bottom: 0, data: [t('results.saving.pvSelfUse'), t('results.saving.arbitrage'), t('results.saving.demand')] },
    grid: { left: 70, right: 30, top: 50, bottom: 40 },
    xAxis: { type: 'category', data: months },
    yAxis: { type: 'value', name: params.currency.symbol },
    series: [
      { name: t('results.saving.pvSelfUse'), type: 'bar', stack: 'saving', data: pvSelfUse, itemStyle: { color: '#faad14' } },
      { name: t('results.saving.arbitrage'), type: 'bar', stack: 'saving', data: arbitrage, itemStyle: { color: '#13c2c2' } },
      { name: t('results.saving.demand'), type: 'bar', stack: 'saving', data: demand, itemStyle: { color: '#1677ff' } },
    ],
  };
}

/** 数值缩写（Sankey 标签）：≥1000 → k */
const fmtK = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v.toFixed(0)}`);

/** 桑基流量数据（年/月/日共用结构） */
interface SankeyFlows {
  pvSelfUse: number;
  bessCharge: number;  // PV/柴油富余充电（AC 口径）
  gridCharge: number;  // 电网充电（谷价套利）
  diesel: number;
  curtail: number;
  feedIn: number;      // 馈网上网（feedInEnabled 时）
  grid: number;
}

/** 从年度汇总聚合（年尺度） */
function aggregateYearFlows(annual: EngineAnnualSummary, monthlyResults: EngineMonthResult[]): SankeyFlows {
  return {
    pvSelfUse: annual.pvSelfUse_kWh || 0,
    bessCharge: monthlyResults.reduce((s, m) => s + m.totals.bessCharge_kWh, 0),
    gridCharge: annual.gridCharge_kWh || 0,
    diesel: monthlyResults.reduce((s, m) => s + m.totals.diesel_kWh, 0),
    curtail: annual.curtailment_kWh || 0,
    feedIn: annual.feedIn_kWh || 0,
    grid: annual.gridImport_kWh || 0,
  };
}

/** 从月度 totals 聚合（月尺度） */
function aggregateMonthFlows(m: EngineMonthResult): SankeyFlows {
  return {
    pvSelfUse: m.totals.pvSelfUse_kWh || 0,
    bessCharge: m.totals.bessCharge_kWh || 0,
    gridCharge: m.totals.gridCharge_kWh || 0,
    diesel: m.totals.diesel_kWh || 0,
    curtail: m.totals.curtailment_kWh || 0,
    feedIn: m.totals.feedIn_kWh || 0,
    grid: m.totals.grid_kWh || 0,
  };
}

/** 从典型日 96 点逐时段聚合（日尺度，stepH=0.25h） */
function aggregateDayFlows(m: EngineMonthResult): SankeyFlows {
  const stepH = 0.25;
  const f: SankeyFlows = { pvSelfUse: 0, bessCharge: 0, gridCharge: 0, diesel: 0, curtail: 0, feedIn: 0, grid: 0 };
  for (const it of m.intervals) {
    const loadKW = it.netLoad + it.pvGen;
    if (it.gridAvailable) {
      f.pvSelfUse += Math.min(it.pvGen, Math.max(loadKW, 0)) * stepH;
      f.gridCharge += it.gridCharge * stepH;
    }
    f.bessCharge += it.bessCharge * stepH;
    f.diesel += it.dieselGen * stepH;
    f.curtail += it.curtailment * stepH;
    f.feedIn += (it.feedIn || 0) * stepH;
    f.grid += it.gridImport * stepH;
  }
  return f;
}

/**
 * 能量流 Sankey（R3 重构 + 时间尺度联动）：
 * - mode: year=全年汇总 / month=所选月份 / day=所选月典型日
 * - 含馈网上网流（PV → 馈网，feedInEnabled 时）
 * - 节点色块 + 名称/数值（K 缩写）标签 + 渐变流带
 */
export function buildSankeyOption(
  t: TFunction,
  annual: EngineAnnualSummary | undefined,
  monthlyResults: EngineMonthResult[],
  opts?: { mode?: 'year' | 'month' | 'day'; month?: number; monthLabel?: string },
) {
  const mode = opts?.mode ?? 'year';
  const monthIdx = (opts?.month ?? 1) - 1;
  const monthResult = monthlyResults[monthIdx];

  let flows: SankeyFlows | null = null;
  if (mode === 'year') {
    if (!annual) return {};
    flows = aggregateYearFlows(annual, monthlyResults);
  } else if (mode === 'month') {
    if (!monthResult) return {};
    flows = aggregateMonthFlows(monthResult);
  } else {
    if (!monthResult?.intervals?.length) return {};
    flows = aggregateDayFlows(monthResult);
  }

  const { pvSelfUse, bessCharge, gridCharge, diesel: dieselKWh, curtail, feedIn, grid } = flows;
  const totalCharge = bessCharge + gridCharge;
  const bessDischarge = mode === 'year'
    ? monthlyResults.reduce((s, m) => s + m.totals.bessDischarge_kWh, 0)
    : mode === 'month'
      ? monthResult.totals.bessDischarge_kWh || 0
      : monthResult.intervals.reduce((s, it) => s + it.bessDischarge * 0.25, 0);
  const loss = Math.max(totalCharge - bessDischarge, 0);

  const N = {
    pv: t('results.sankey.pvGen'),
    grid: t('results.sankey.gridImport'),
    diesel: t('results.sankey.dieselGen'),
    load: t('results.sankey.toLoad'),
    charge: t('results.sankey.toBess'),
    discharge: t('results.sankey.bessDischarge'),
    curtail: t('results.sankey.curtailment'),
    feedIn: t('results.sankey.feedIn'),
    loss: t('results.sankey.loss'),
  };

  const nodes = [
    { name: N.pv, itemStyle: { color: '#faad14' } },
    { name: N.grid, itemStyle: { color: '#ff7a45' } },
    { name: N.diesel, itemStyle: { color: '#722ed1' } },
    { name: N.load, itemStyle: { color: '#1677ff' } },
    { name: N.charge, itemStyle: { color: '#52c41a' } },
    { name: N.discharge, itemStyle: { color: '#13c2c2' } },
    { name: N.curtail, itemStyle: { color: '#bfbfbf' } },
    { name: N.feedIn, itemStyle: { color: '#2f54eb' } },
    { name: N.loss, itemStyle: { color: '#eb2f96' } },
  ];

  const links = [
    { source: N.pv, target: N.load, value: +pvSelfUse.toFixed(0) },
    { source: N.pv, target: N.charge, value: +bessCharge.toFixed(0) },
    { source: N.pv, target: N.curtail, value: +curtail.toFixed(0) },
    { source: N.pv, target: N.feedIn, value: +feedIn.toFixed(0) },
    { source: N.grid, target: N.load, value: +Math.max(grid - gridCharge, 0).toFixed(0) },
    { source: N.grid, target: N.charge, value: +gridCharge.toFixed(0) },
    { source: N.charge, target: N.discharge, value: +bessDischarge.toFixed(0) },
    { source: N.charge, target: N.loss, value: +loss.toFixed(0) },
    { source: N.discharge, target: N.load, value: +bessDischarge.toFixed(0) },
    { source: N.diesel, target: N.load, value: +dieselKWh.toFixed(0) },
  ].filter(l => l.value > 0);

  const scopeSuffix = mode === 'year' ? '' : ` — ${opts?.monthLabel ?? ''}${mode === 'day' ? ` ${t('results.timeScale.day')}` : ''}`;

  return {
    title: { text: `${t('results.sankey.title')}${scopeSuffix} (kWh)`, left: 'center' },
    tooltip: { trigger: 'item', valueFormatter: (v: any) => `${Number(v).toLocaleString()} kWh` },
    series: [
      {
        type: 'sankey',
        emphasis: { focus: 'adjacency' },
        data: nodes,
        links,
        top: 64,
        bottom: 16,
        left: 12,
        right: 96,
        nodeWidth: 16,
        nodeGap: 18,
        layoutIterations: 48,
        label: {
          formatter: (p: any) => `${p.name}\n${fmtK(Number(p.value) || 0)}`,
          fontSize: 12,
          fontWeight: 600,
          color: '#262626',
        },
        itemStyle: { borderRadius: 3 },
        lineStyle: { color: 'gradient', curveness: 0.5, opacity: 0.35 },
      },
    ],
  };
}

/**
 * 累计现金流双线对比：未折现（静态口径，零交叉=静态回收期）+ 折现（动态口径）。
 * 双回收点用垂直虚线 + 零线交叉圆点标注，一眼读出"X.XX 年回本"。
 * （years 限定口径，如报告用 10 年）
 */
export function buildCumCashflowOption(t: TFunction, fin: FinanceResult, years?: number) {
  const rows = years ? fin.cashflow.filter((r) => r.year <= years) : fin.cashflow;
  // 未折现累计 = netCashflow 前缀和（Y0 即 -CAPEX，与引擎口径一致）
  let acc = 0;
  const cumStatic = rows.map((r) => +(acc += r.netCashflow).toFixed(0));
  const maxYear = rows[rows.length - 1]?.year ?? 0;
  const valid = (p: number) => Number.isFinite(p) && p >= 0 && p <= maxYear;
  const pS = valid(fin.paybackStatic) ? fin.paybackStatic : null;
  const pD = valid(fin.paybackDynamic) ? fin.paybackDynamic : null;

  // 零线交叉圆点 + 顶部标签（回收点文字）
  const mkPoint = (pbp: number | null, color: string, label: string) =>
    pbp === null
      ? undefined
      : {
          symbol: 'circle', symbolSize: 11,
          itemStyle: { color, borderColor: '#fff', borderWidth: 2 },
          label: { position: 'top' as const, distance: 8, fontSize: 11, color, fontWeight: 700 as const, formatter: () => label },
          data: [{ coord: [+pbp.toFixed(2), 0] }],
        };
  // 垂直虚线（可选附带红色零轴参考线，无文字标签，避免右缘裁切）
  const mkLine = (pbp: number | null, color: string, withZero = false) => ({
    silent: true, symbol: 'none',
    data: [
      ...(withZero ? [{ yAxis: 0, lineStyle: { color: '#ff4d4f', type: 'dashed' as const } }] : []),
      ...(pbp === null ? [] : [{ xAxis: +pbp.toFixed(2) }]),
    ],
    lineStyle: { color, type: 'dashed' as const, width: 1.5 },
    label: { show: false },
  });

  return {
    title: { text: `${t('params.scheme')} ${fin.scenarioId} ${t('finance.cashflowChart')}${years ? ` (${years}Y)` : ''}`, left: 'center' },
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0, data: [t('finance.chart.cumStatic'), t('finance.chart.cumDcf')] },
    xAxis: { type: 'category', data: rows.map(r => `Y${r.year}`) },
    yAxis: { type: 'value', name: t('finance.chart.cumulativeCashflow') },
    series: [
      {
        name: t('finance.chart.cumStatic'),
        type: 'line',
        data: cumStatic,
        lineStyle: { color: '#389e0d', width: 2 }, itemStyle: { color: '#389e0d' },
        symbol: 'circle', symbolSize: 6,
        markPoint: mkPoint(pS, '#389e0d', t('finance.chart.paybackStaticMark', { y: (pS ?? 0).toFixed(2) })),
        markLine: mkLine(pS, '#389e0d', true),
      },
      {
        name: t('finance.chart.cumDcf'),
        type: 'line',
        data: rows.map(r => r.cumulativeDiscountedCF),
        lineStyle: { color: '#1677ff', width: 2 }, itemStyle: { color: '#1677ff' },
        symbol: 'circle', symbolSize: 6,
        areaStyle: { color: 'rgba(22,119,255,0.1)' },
        markPoint: mkPoint(pD, '#1677ff', t('finance.chart.paybackDynamicMark', { y: (pD ?? 0).toFixed(2) })),
        markLine: mkLine(pD, '#1677ff'),
      },
    ],
    grid: { left: 60, right: 40, top: 40, bottom: 48 },
  };
}

/** 报告章数值缩写（复用 fmtK 风格）：≥1M → M，≥1k → k */
const fmtMoneyK = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return v.toFixed(0);
};

/**
 * 年度费用构成对比（RR 案例 OPEX 堆叠条风格）：
 * 部署前（电量/需量/柴油）vs 部署后（电量/需量/柴油 + 运维），条端合计标签 + 副标题净节省。
 * 数字全部取自已计算的财务结果（fin.baseline / sim.annual / 首年 OPEX），不产生新论据。
 */
export function buildCostCompareOption(
  t: TFunction,
  fin: FinanceResult,
  afterAnnual: Pick<EngineAnnualSummary, 'gridCost' | 'demandChargeCost' | 'dieselCost'>,
  opexYear1: number,
  sym: string,
) {
  const cats = [t('report.savings.before'), t('report.savings.after')];
  const seg = (
    name: string, before: number, after: number, color: string,
  ) => ({
    name, type: 'bar', stack: 'cost', barWidth: 34,
    data: [+before.toFixed(0), +after.toFixed(0)],
    itemStyle: { color },
    label: {
      show: true, position: 'inside' as const, fontSize: 10, color: '#fff',
      formatter: (p: any) => (Math.abs(p.value) >= 20000 ? fmtMoneyK(p.value) : ''),
    },
  });
  const beforeTotal = fin.baseline.annualTotal;
  const afterTotal = afterAnnual.gridCost + afterAnnual.demandChargeCost + afterAnnual.dieselCost + opexYear1;
  const totals = [beforeTotal, afterTotal];
  const netSaving = beforeTotal - afterTotal;

  return {
    title: {
      text: t('report.savings.costCompareTitle'), left: 'center',
      subtext: `− ${t('report.savings.costNetSaving', { v: `${fmtMoneyK(netSaving)} ${sym}` })}`,
      subtextStyle: { color: '#389e0d', fontWeight: 600, fontSize: 13 },
    },
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      valueFormatter: (v: any) => `${Number(v).toLocaleString()} ${sym}`,
    },
    legend: {
      bottom: 0,
      // 透明合计标签系列不进图例
      data: [
        t('report.savings.gridEnergy'), t('report.savings.demand'),
        t('report.savings.diesel'), t('report.savings.costOpex'),
      ],
    },
    grid: { left: 90, right: 90, top: 64, bottom: 48 },
    xAxis: {
      type: 'value',
      axisLabel: { formatter: (v: number) => fmtMoneyK(v) },
    },
    yAxis: { type: 'category', data: cats, inverse: true },
    series: [
      seg(t('report.savings.gridEnergy'), fin.baseline.annualGridCost, afterAnnual.gridCost, '#1677ff'),
      seg(t('report.savings.demand'), fin.baseline.annualDemandCharge, afterAnnual.demandChargeCost, '#fa8c16'),
      seg(t('report.savings.diesel'), fin.baseline.annualDieselCost, afterAnnual.dieselCost, '#722ed1'),
      seg(t('report.savings.costOpex'), 0, opexYear1, '#8c8c8c'),
      // 透明占位系列：条端合计标签
      {
        name: 'total', type: 'bar', stack: 'cost', data: [0, 0],
        itemStyle: { color: 'transparent' },
        label: {
          show: true, position: 'right' as const, fontSize: 11.5, fontWeight: 700, color: '#262626',
          formatter: (p: any) => `${fmtMoneyK(totals[p.dataIndex])} ${sym}`,
        },
        tooltip: { show: false },
        silent: true,
      },
    ],
  };
}

/**
 * @deprecated 报告投资章已改用 buildPaybackCashflowOption（红绿分区式）；保留一个迭代周期后删除。
 *
 * 累计费用双线对比（RR 案例 Cost comparison 风格，10 年口径）：
 * - 不投资（纯电网）：Σ 基线年总费用 × 电价增长
 * - 投资光储：CAPEX + Σ（场景年总费用 × 电价增长 + 当年 OPEX）
 * 两线交点即静态回收期（与 paybackStatic 同源：差值累计 = 净现金流累计），标注回收点。
 */
export function buildCumCostCompareOption(
  t: TFunction,
  fin: FinanceResult,
  afterAnnualTotalCost: number,
  priceGrowth: number,
  years = 10,
  sym: string,
) {
  const xs: string[] = ['Y0'];
  const conv: number[] = [0];
  const micro: number[] = [+fin.capex.toFixed(0)];
  let convCum = 0;
  let microCum = fin.capex;
  for (let y = 1; y <= years; y++) {
    const growth = Math.pow(1 + priceGrowth, y - 1);
    const cf = fin.cashflow.find((r) => r.year === y);
    convCum += fin.baseline.annualTotal * growth;
    microCum += afterAnnualTotalCost * growth + (cf?.opex ?? 0);
    xs.push(`Y${y}`);
    conv.push(+convCum.toFixed(0));
    micro.push(+microCum.toFixed(0));
  }
  // 回收点（小数年，线性插值 micro 累计值）
  const pbp = fin.paybackStatic;
  const y0 = Math.floor(pbp);
  const frac = pbp - y0;
  const microAtPbp = (micro[y0] ?? 0) + frac * ((micro[y0 + 1] ?? micro[y0] ?? 0) - (micro[y0] ?? 0));

  return {
    title: { text: t('report.invest.cumCostTitle', { years }), left: 'center' },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v: any) => `${fmtMoneyK(Number(v))} ${sym}`,
    },
    legend: { bottom: 0 },
    grid: { left: 70, right: 30, top: 46, bottom: 48 },
    xAxis: { type: 'category', data: xs },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => fmtMoneyK(v) } },
    series: [
      {
        name: t('report.invest.cumCostConv'), type: 'line', data: conv,
        lineStyle: { color: '#8c8c8c', width: 2 }, itemStyle: { color: '#8c8c8c' },
        symbol: 'circle', symbolSize: 6,
      },
      {
        name: t('report.invest.cumCostMicro'), type: 'line', data: micro,
        lineStyle: { color: '#1677ff', width: 2.5 }, itemStyle: { color: '#1677ff' },
        symbol: 'circle', symbolSize: 6,
        areaStyle: { color: 'rgba(22,119,255,0.08)' },
        markPoint: {
          symbol: 'circle', symbolSize: 11,
          itemStyle: { color: '#389e0d', borderColor: '#fff', borderWidth: 2 },
          label: {
            position: 'top', distance: 8,
            fontSize: 11, color: '#389e0d', fontWeight: 700,
            formatter: () => t('report.invest.cumCostBreakEven', { y: pbp.toFixed(1) }),
          },
          data: [{ coord: [+pbp.toFixed(2), +microAtPbp.toFixed(0)] }],
        },
        markLine: {
          silent: true, symbol: 'none',
          data: [{ xAxis: +pbp.toFixed(2) }],
          lineStyle: { color: '#389e0d', type: 'dashed', width: 1.5 },
          label: { show: false },
        },
      },
    ],
  };
}

/** 报告投资章 10 年口径指标：NPV(10y) / LCOE(10y) / 10 年总收益 */
export function computeTenYearMetrics(
  fin: FinanceResult,
  annualPvKwh: number,
  discountRate: number,
): { npv10: number; lcoe10: number; revenue10: number; opex10: number } {
  const cf10 = fin.cashflow.filter((r) => r.year <= 10);
  const npv10 = cf10.reduce((s, r) => s + r.discountedCashflow, 0);
  const revenue10 = cf10.reduce((s, r) => s + r.totalRevenue, 0);
  const opex10 = cf10.reduce((s, r) => s + r.opex, 0);
  let discOpex = 0;
  let discEnergy = 0;
  for (let y = 1; y <= 10; y++) {
    const df = Math.pow(1 + discountRate, y);
    discOpex += (fin.cashflow.find((r) => r.year === y)?.opex ?? 0) / df;
    discEnergy += annualPvKwh / df;
  }
  const lcoe10 = (fin.capex + discOpex) / Math.max(discEnergy, 1);
  return { npv10, lcoe10, revenue10, opex10 };
}

/**
 * 投资章主图（报告改版）：未折现累计现金流单线 + 零下红区/零上绿区 markArea
 * + 大号双行 PAYBACK 回收点标注（对标参考报告 P6）。
 * fx 传入时 series/坐标轴一律用换算后数值，保证图与表现值一致。
 */
export function buildPaybackCashflowOption(
  t: TFunction,
  fin: FinanceResult,
  years = 10,
  fx?: ReportFx,
) {
  const rows = fin.cashflow.filter((r) => r.year <= years);
  let acc = 0;
  const cumStaticBrl = rows.map((r) => +(acc += r.netCashflow).toFixed(0));
  const conv = (v: number) => (fx ? +fx.to(v).toFixed(0) : v);
  const cumStatic = cumStaticBrl.map(conv);
  const maxYear = rows[rows.length - 1]?.year ?? 0;
  const pbp = fin.paybackStatic;
  const valid = Number.isFinite(pbp) && pbp >= 0 && pbp <= maxYear;
  const fmt = (v: number) => fmtMoneyShort(v);
  const sym = fx?.sym ?? '';

  return {
    title: { text: t('report.invest.cashflowTable10'), left: 'center' },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v: any) => `${fmt(Number(v))} ${sym}`,
    },
    grid: { left: 70, right: 40, top: 46, bottom: 40 },
    xAxis: { type: 'category', data: rows.map((r) => `Y${r.year}`) },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => fmt(v) } },
    series: [
      {
        name: t('finance.chart.cumStatic'),
        type: 'line',
        data: cumStatic,
        lineStyle: { color: '#262626', width: 2.5 },
        itemStyle: { color: '#262626' },
        symbol: 'circle',
        symbolSize: 7,
        markArea: {
          silent: true,
          data: [
            [
              {
                yAxis: 'min',
                itemStyle: { color: 'rgba(255,77,79,0.10)' },
                label: {
                  show: true, position: 'insideBottomLeft' as const,
                  fontSize: 11, color: 'rgba(207,19,34,0.75)',
                  formatter: t('report.invest.zoneNeg'),
                },
              },
              { yAxis: 0 },
            ],
            [
              {
                yAxis: 0,
                itemStyle: { color: 'rgba(56,158,13,0.10)' },
                label: {
                  show: true, position: 'insideTopRight' as const,
                  fontSize: 11, color: 'rgba(35,120,4,0.75)',
                  formatter: t('report.invest.zonePos'),
                },
              },
              { yAxis: 'max' },
            ],
          ],
        },
        markLine: {
          silent: true,
          symbol: 'none',
          data: [
            { yAxis: 0, lineStyle: { color: '#8c8c8c', type: 'solid' as const, width: 1 } },
            ...(valid ? [{ xAxis: +pbp.toFixed(2) }] : []),
          ],
          lineStyle: { color: '#389e0d', type: 'dashed' as const, width: 1.5 },
          label: { show: false },
        },
        markPoint: valid
          ? {
              symbol: 'circle', symbolSize: 14,
              itemStyle: { color: '#389e0d', borderColor: '#fff', borderWidth: 2 },
              label: {
                position: 'right' as const, distance: 12,
                fontSize: 14, fontWeight: 800 as const, color: '#237804', lineHeight: 19,
                align: 'left' as const,
                formatter: () =>
                  t('report.invest.paybackMark', {
                    y: pbp.toFixed(2),
                    yy: Math.floor(pbp),
                    mm: Math.round((pbp % 1) * 12),
                  }),
              },
              data: [{ coord: [+pbp.toFixed(2), 0] }],
            }
          : undefined,
      },
    ],
  };
}

/** 瀑布图条目：start/end 为全长柱，delta 为正负增减段 */
export interface WaterfallItem {
  key: string;
  label: string;
  value: number;
  kind: 'start' | 'delta' | 'end';
}

/**
 * 通用瀑布图（HW 章双瀑布复用：吞吐量 MWh / NPV 金额）：
 * 经典两系列堆叠——透明辅助系列垫底 + 可见系列（正绿负红，start/end 蓝）。
 * fmt 为条端数值标签格式化（MWh 或 fx.money 换算后值）。
 */
export function buildWaterfallOption(
  items: WaterfallItem[],
  opts: {
    unit: string;
    fmt: (v: number) => string;
    colorPos?: string;
    colorNeg?: string;
    colorTotal?: string;
  },
) {
  const colorPos = opts.colorPos ?? '#389e0d';
  const colorNeg = opts.colorNeg ?? '#ff4d4f';
  const colorTotal = opts.colorTotal ?? '#1677ff';

  const labels = items.map((it) => it.label);
  const assist: number[] = [];
  const bars: { value: number; itemStyle: { color: string } }[] = [];
  let run = 0;
  for (const it of items) {
    if (it.kind === 'start' || it.kind === 'end') {
      assist.push(0);
      bars.push({ value: +it.value.toFixed(1), itemStyle: { color: colorTotal } });
      run = it.value;
    } else {
      const from = run;
      run = run + it.value;
      const lo = Math.min(from, run);
      assist.push(+lo.toFixed(1));
      bars.push({
        value: +Math.abs(it.value).toFixed(1),
        itemStyle: { color: it.value >= 0 ? colorPos : colorNeg },
      });
    }
  }

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (ps: any) => {
        const p = Array.isArray(ps) ? ps[1] : ps;
        const it = items[p?.dataIndex ?? 0];
        if (!it) return '';
        const v = it.kind === 'delta' ? it.value : it.value;
        const sign = it.kind === 'delta' && v > 0 ? '+' : '';
        return `${it.label}<br/>${sign}${opts.fmt(v)} ${opts.unit}`;
      },
    },
    grid: { left: 64, right: 16, top: 28, bottom: 56 },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { interval: 0, rotate: 24, fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      name: opts.unit,
      axisLabel: { formatter: (v: number) => opts.fmt(v) },
    },
    series: [
      {
        name: 'assist', type: 'bar', stack: 'wf', data: assist,
        itemStyle: { color: 'transparent' }, tooltip: { show: false }, silent: true,
      },
      {
        name: 'value', type: 'bar', stack: 'wf', barWidth: '52%',
        data: bars,
        label: {
          show: true, position: 'top' as const, fontSize: 10, fontWeight: 600, color: '#262626',
          formatter: (p: any) => {
            const it = items[p.dataIndex];
            if (!it) return '';
            const sign = it.kind === 'delta' && it.value > 0 ? '+' : it.value < 0 ? '−' : '';
            return `${sign}${opts.fmt(Math.abs(it.value))}`;
          },
        },
      },
    ],
  };
}
