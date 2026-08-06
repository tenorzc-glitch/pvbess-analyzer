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

/**
 * 年能量流 Sankey（批次 R3 重构）：
 * - 更名：充电 → 储能充电、电池放电 → 储能放电
 * - 新增电网→储能充电流（谷价套利的日末恢复充电口径）
 * - 节点色块 + 名称/数值（K 缩写）标签 + 渐变流带（参考客户提供的样式）
 */
export function buildSankeyOption(
  t: TFunction,
  annual: EngineAnnualSummary | undefined,
  monthlyResults: EngineMonthResult[],
) {
  if (!annual) return {};

  const bessDischarge = monthlyResults.reduce((s, m) => s + m.totals.bessDischarge_kWh, 0);
  const bessCharge = monthlyResults.reduce((s, m) => s + m.totals.bessCharge_kWh, 0); // PV/柴油富余充电（逐槽 AC 口径）
  const gridCharge = annual.gridCharge_kWh || 0; // 日末恢复充电（谷价电网）
  const dieselKWh = monthlyResults.reduce((s, m) => s + m.totals.diesel_kWh, 0);
  const curtail = annual.curtailment_kWh || 0;
  const grid = annual.gridImport_kWh || 0;
  const pvSelfUse = annual.pvSelfUse_kWh || 0;
  const totalCharge = bessCharge + gridCharge;
  const loss = Math.max(totalCharge - bessDischarge, 0);

  const N = {
    pv: t('results.sankey.pvGen'),
    grid: t('results.sankey.gridImport'),
    diesel: t('results.sankey.dieselGen'),
    load: t('results.sankey.toLoad'),
    charge: t('results.sankey.toBess'),      // 储能充电
    discharge: t('results.sankey.bessDischarge'), // 储能放电
    curtail: t('results.sankey.curtailment'),
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
    { name: N.loss, itemStyle: { color: '#eb2f96' } },
  ];

  const links = [
    { source: N.pv, target: N.load, value: +pvSelfUse.toFixed(0) },
    { source: N.pv, target: N.charge, value: +bessCharge.toFixed(0) },
    { source: N.pv, target: N.curtail, value: +curtail.toFixed(0) },
    { source: N.grid, target: N.load, value: +Math.max(grid - gridCharge, 0).toFixed(0) },
    { source: N.grid, target: N.charge, value: +gridCharge.toFixed(0) },
    { source: N.charge, target: N.discharge, value: +bessDischarge.toFixed(0) },
    { source: N.charge, target: N.loss, value: +loss.toFixed(0) },
    { source: N.discharge, target: N.load, value: +bessDischarge.toFixed(0) },
    { source: N.diesel, target: N.load, value: +dieselKWh.toFixed(0) },
  ].filter(l => l.value > 0);

  return {
    title: { text: `${t('results.sankey.title')} (kWh)`, left: 'center' },
    tooltip: { trigger: 'item', valueFormatter: (v: any) => `${Number(v).toLocaleString()} kWh` },
    series: [
      {
        type: 'sankey',
        emphasis: { focus: 'adjacency' },
        data: nodes,
        links,
        // 顶部留白避免与居中标题重叠（节点标签含数值两行文字）；
        // 右侧留白容纳右缘节点的外置标签（如 供给负荷 785.1k）
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

/** 累计折现现金流曲线（含回收点 0 轴标线；years 限定口径，如报告用 10 年） */
export function buildCumCashflowOption(t: TFunction, fin: FinanceResult, years?: number) {
  const rows = years ? fin.cashflow.filter((r) => r.year <= years) : fin.cashflow;
  return {
    title: { text: `${t('params.scheme')} ${fin.scenarioId} ${t('finance.cashflowChart')}${years ? ` (${years}Y)` : ''}`, left: 'center' },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: rows.map(r => `Y${r.year}`) },
    yAxis: { type: 'value', name: t('finance.chart.cumulativeCashflow') },
    series: [
      {
        name: t('finance.cashflowChart'),
        type: 'line',
        data: rows.map(r => r.cumulativeDiscountedCF),
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
