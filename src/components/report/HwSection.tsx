/**
 * HW 增量价值章（报告改版）：
 * 参数对比表 + 双瀑布（吞吐 MWh / NPV）+ 财务 Δ 表 + 深色 Investor conclusion 框。
 * 归因数据来自 computeFactorAttribution（顺序替换法，口径 indicative）。
 */
import { Table } from 'antd';
import { TFunction } from 'i18next';
import ReactECharts from 'echarts-for-react';
import { InputParams } from '../../types/params';
import { ScenarioConfig } from '../../types/simulation';
import { FinanceResult } from '../../types/finance';
import { EngineScenarioResult } from '../../engine/types';
import {
  BrandParams, HWEstimate, computeFactorAttribution, computeThroughput10Kwh,
} from '../../utils/brand';
import { ReportFx, fmtMoneyShort } from '../../utils/report-fx';
import { buildWaterfallOption, WaterfallItem, applyChartTextStyle, CHART_TEXT_LIGHT_BG } from '../../utils/report-charts';

const NAVY = '#0b2545';

interface HwSectionProps {
  t: TFunction;
  params: InputParams;
  scen: ScenarioConfig;
  fin: FinanceResult;
  sim: EngineScenarioResult;
  /** 行业基准参数 */
  baseline: BrandParams;
  /** 对比目标品牌参数（报告章只深入一个选定品牌） */
  target: BrandParams;
  /** 目标品牌显示名（如 HW / Brand X） */
  targetLabel: string;
  hw: HWEstimate;
  tenYear: { npv10: number; revenue10: number };
  firstYearOpex: number;
  fx: ReportFx;
}

const FACTOR_KEY: Record<string, string> = {
  rte: 'report.hw.wf.fRte', transformer: 'report.hw.wf.fTransformer',
  dod: 'report.hw.wf.fDod', socOffgrid: 'report.hw.wf.fSocOffgrid',
  days: 'report.hw.wf.fDays', soh: 'report.hw.wf.fSoh',
  opex: 'report.hw.wf.fOpex', warranty: 'report.hw.wf.fWarranty', balancing: 'report.hw.wf.fBalancing',
  coolant: 'report.hw.wf.fCoolant', calibration: 'report.hw.wf.fCalibration',
  capex: 'report.hw.wf.fCapex',
};

export default function HwSection(p: HwSectionProps) {
  const { t, fx } = p;
  const ind = p.baseline;
  const hwB = p.target;
  const pct = (v: number) => (v * 100).toFixed(0);
  const sohY10 = (arr: number[]) => arr[9] ?? 0;

  const att = computeFactorAttribution(p.params, p.scen, p.fin, ind, hwB, p.sim);

  // 瀑布端点锚定引擎口径：归因模型（简化口径）的行业基线与引擎 NPV10/吞吐有差，
  // 端点改用引擎一致值（tenYear.npv10 / params.sohCurve 吞吐），各因子 delta 按比例缩放——
  // 分项分配本就 indicative（顺序相关），缩放不改变结论，只保证图与 Δ 表/结论框一致。
  const annualDischarge0 = p.sim.monthlyResults.reduce((s, m) => s + (m.totals.bessDischarge_kWh || 0), 0);
  const thrInd = computeThroughput10Kwh(annualDischarge0, p.params.sohCurve);
  const thrSpan = att.final.throughput10 - att.base.throughput10;
  const thrScale = Math.abs(thrSpan) > 1e-9 ? (p.hw.throughput10 - thrInd) / thrSpan : 1;
  const npvSpan = att.final.npv10 - att.base.npv10;
  const npvScale = Math.abs(npvSpan) > 1e-9 ? (p.hw.npv10 - p.tenYear.npv10) / npvSpan : 1;

  // ── 吞吐量瀑布（MWh）：前 4 因子（opex/capex 不影响吞吐） ──
  const thrItems: WaterfallItem[] = [
    { key: 'base', label: t('report.hw.wf.wfBase'), value: +(thrInd / 1000).toFixed(1), kind: 'start' },
    ...att.steps.filter((s) => Math.abs(s.dThroughput) > 1e-9).map((s) => ({
      key: s.factor, label: t(FACTOR_KEY[s.factor]), value: +((s.dThroughput * thrScale) / 1000).toFixed(1), kind: 'delta' as const,
    })),
    { key: 'hw', label: p.targetLabel, value: +(p.hw.throughput10 / 1000).toFixed(1), kind: 'end' },
  ];
  // ── NPV 瀑布（展示币种）：全 6 因子 ──
  const npvItems: WaterfallItem[] = [
    { key: 'base', label: t('report.hw.wf.wfBase'), value: +fx.to(p.tenYear.npv10).toFixed(0), kind: 'start' },
    ...att.steps.map((s) => ({
      key: s.factor, label: t(FACTOR_KEY[s.factor]), value: +fx.to(s.dNpv * npvScale).toFixed(0), kind: 'delta' as const,
    })),
    { key: 'hw', label: p.targetLabel, value: +fx.to(p.hw.npv10).toFixed(0), kind: 'end' },
  ];

  const paramRows = [
    { key: 'rte', metric: `${t('compare.rte')} (RTE)`, industry: `${pct(ind.rte)}%`, hw: `${pct(hwB.rte)}%` },
    { key: 'dod', metric: t('compare.dod'), industry: `${pct(ind.dod)}%`, hw: `${pct(hwB.dod)}%` },
    { key: 'days', metric: t('compare.operatingDays'), industry: `${ind.operatingDaysPerYear}`, hw: `${hwB.operatingDaysPerYear}` },
    { key: 'soh10', metric: t('compare.sohY10'), industry: `${pct(sohY10(ind.sohCurve))}%`, hw: `${pct(sohY10(hwB.sohCurve))}%` },
    { key: 'opex', metric: t('compare.opexYear1'), industry: fx.money(p.firstYearOpex), hw: fx.money(p.hw.opexYear1) },
    { key: 'cost', metric: t('compare.fullPackageCost'), industry: `${fmtMoneyShort(fx.to(ind.costPerKWh))} ${fx.sym}/kWh`, hw: `${fmtMoneyShort(fx.to(hwB.costPerKWh))} ${fx.sym}/kWh` },
  ];
  const brandCols = [
    { title: t('common.metric'), dataIndex: 'metric', key: 'metric' },
    { title: t('compare.industry'), dataIndex: 'industry', key: 'industry', align: 'right' as const },
    { title: p.targetLabel, dataIndex: 'hw', key: 'hw', align: 'right' as const },
  ];

  const finRows = [
    { key: 'capex', metric: t('finance.table.capex'), industry: fx.money(p.fin.capex), hw: fx.money(p.hw.capex), delta: fx.money(p.hw.capex - p.fin.capex) },
    { key: 'opex', metric: t('compare.opexYear1'), industry: fx.money(p.firstYearOpex), hw: fx.money(p.hw.opexYear1), delta: fx.money(p.hw.opexYear1 - p.firstYearOpex) },
    { key: 'rev10', metric: t('compare.revenue10'), industry: fx.money(p.tenYear.revenue10), hw: fx.money(p.hw.revenue10), delta: fx.money(p.hw.revenue10 - p.tenYear.revenue10) },
    { key: 'npv10', metric: t('compare.npv10'), industry: fx.money(p.tenYear.npv10), hw: fx.money(p.hw.npv10), delta: fx.money(p.hw.npv10 - p.tenYear.npv10) },
    { key: 'pbp', metric: t('finance.table.paybackStatic'), industry: p.fin.paybackStatic.toFixed(2), hw: p.hw.paybackStatic.toFixed(2), delta: (p.hw.paybackStatic - p.fin.paybackStatic).toFixed(2) },
  ];
  const finCols = [
    { title: t('common.metric'), dataIndex: 'metric', key: 'metric' },
    { title: t('compare.industry'), dataIndex: 'industry', key: 'industry', align: 'right' as const },
    { title: p.targetLabel, dataIndex: 'hw', key: 'hw', align: 'right' as const },
    {
      title: 'Δ', dataIndex: 'delta', key: 'delta', align: 'right' as const,
      render: (v: string) => <span style={{ fontWeight: 700, color: '#722ed1' }}>{v}</span>,
    },
  ];

  const annualDischarge = p.sim.monthlyResults.reduce((s, m) => s + (m.totals.bessDischarge_kWh || 0), 0);
  const throughput10Ind = computeThroughput10Kwh(annualDischarge, p.params.sohCurve);

  return (
    <>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#262626', margin: '4px 0 8px' }}>{t('report.hw.paramTitle')}</div>
      <Table size="small" pagination={false} dataSource={paramRows} columns={brandCols} style={{ marginBottom: 14 }} />

      <div style={{ display: 'flex', gap: 12, marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#595959', textAlign: 'center' }}>{t('report.hw.wf.thrTitle')}</div>
          <ReactECharts option={applyChartTextStyle(buildWaterfallOption(thrItems, { unit: 'MWh', fmt: (v) => v.toFixed(0) }), CHART_TEXT_LIGHT_BG)} style={{ height: 250 }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#595959', textAlign: 'center' }}>{t('report.hw.wf.npvTitle')}</div>
          <ReactECharts option={applyChartTextStyle(buildWaterfallOption(npvItems, { unit: fx.sym, fmt: fmtMoneyShort }), CHART_TEXT_LIGHT_BG)} style={{ height: 250 }} />
        </div>
      </div>
      <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 12, textAlign: 'right' }}>
        {t('report.hw.throughputTitle')}：{(throughput10Ind / 1000).toFixed(0)} → {(p.hw.throughput10 / 1000).toFixed(0)} MWh
      </div>

      <Table size="small" pagination={false} dataSource={finRows} columns={finCols} style={{ marginBottom: 14 }} />

      {/* 深色 Investor conclusion 收束框 */}
      <div style={{ background: NAVY, borderRadius: 8, padding: '16px 20px', marginTop: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
          Investor conclusion
        </div>
        <div style={{ fontSize: 12.5, color: '#ffffff', lineHeight: 1.9 }}>
          {t('report.hw.wf.conclusion', {
            brand: p.targetLabel,
            premium: fx.money(p.hw.capex - p.fin.capex),
            from: fx.money(p.tenYear.npv10),
            to: fx.money(p.hw.npv10),
            pFrom: p.fin.paybackStatic.toFixed(2),
            pTo: p.hw.paybackStatic.toFixed(2),
          })}
        </div>
      </div>
    </>
  );
}
