/**
 * 投资报告面板：配置区（方案/客户/代表月/币种/开关）+ 白底预览区（即 PDF 截图源）+ 导出。
 * 预览区嵌套 ConfigProvider 强制浅色——antd 6 默认 CSS 变量模式，
 * html2canvas 对 var(--ant-*) 支持不全，必须回退内联 hex（pdf-blocks onclone 内联计算样式）。
 *
 * 报告改版（对标参考报告 7 页结构）：
 * ① 深蓝封面（CoverBlock）② 案例定义 WHO/WHY/HOW ③ 运行策略 ④ 节省明细
 * ⑤ 能量流+解读框 ⑥ 投资收益（InvestBlock 红绿分区）⑦ HW 增量价值（HwSection 双瀑布）
 * 每章：结论式标题 + 副标题 + 右上角灰色栏目标签；金额统一走 report-fx 展示层换算。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Button, Card, Checkbox, Col, ConfigProvider, Descriptions, Empty, Input, InputNumber, Row,
  Select, Space, Spin, Statistic, Switch, Table, Typography, message, theme as antdTheme,
} from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { useTranslation } from 'react-i18next';
import { useSimulationStore } from '../../store/useSimulationStore';
import { useFinanceStore } from '../../store/useFinanceStore';
import { useParamsStore } from '../../store/useParamsStore';
import { useProjectStore } from '../../store/useProjectStore';
import { useReportStore } from '../../store/useReportStore';
import { scenarioDisplayName } from '../../utils/scenario-name';
import { useBrandStore } from '../../store/useBrandStore';
import { estimateBrandFinanceAnchored, computeThroughput10Kwh } from '../../utils/brand';
import { exportBlocksPDF } from '../../utils/pdf-blocks';
import { createReportFx, DEFAULT_FX_RATE, ReportCurrencyCode } from '../../utils/report-fx';
import {
  buildDispatchOption, buildMonthlySavingOption, buildSankeyOption,
  buildCostCompareOption, computeTenYearMetrics,
  applyChartTextStyle, CHART_TEXT_LIGHT_BG,
} from '../../utils/report-charts';
import CoverBlock from './CoverBlock';
import InvestBlock from './InvestBlock';
import HwSection from './HwSection';

const { Title, Text } = Typography;

const sanitizeFileName = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60);

/* ── RR 案例风格的极简系统示意图标（内联 SVG 基础图形，html2canvas 兼容） ── */
const SvgGrid = () => (
  <svg width="30" height="40" viewBox="0 0 30 40">
    <path d="M15 3 L5 37 M15 3 L25 37 M9 26 L21 26 M11 16 L19 16 M7 33 L23 33"
      stroke="#8c8c8c" strokeWidth="2" fill="none" strokeLinecap="round" />
  </svg>
);
const SvgFactory = () => (
  <svg width="42" height="40" viewBox="0 0 42 40">
    <path d="M3 37 L3 15 L13 23 L13 15 L23 23 L23 15 L33 23 L33 37 Z"
      fill="none" stroke="#595959" strokeWidth="2" strokeLinejoin="round" />
    <rect x="35" y="7" width="5" height="30" fill="none" stroke="#595959" strokeWidth="2" />
    <rect x="8" y="28" width="5" height="5" fill="#595959" />
    <rect x="18" y="28" width="5" height="5" fill="#595959" />
  </svg>
);
const SvgPV = () => (
  <svg width="38" height="34" viewBox="0 0 38 34">
    <g transform="rotate(-10 19 15)">
      <rect x="3" y="6" width="32" height="18" rx="1" fill="none" stroke="#faad14" strokeWidth="2" />
      <path d="M3 12 L35 12 M3 18 L35 18 M14 6 L14 24 M24 6 L24 24" stroke="#faad14" strokeWidth="1.2" />
    </g>
    <path d="M19 28 L19 33 M14 33 L24 33" stroke="#faad14" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
const SvgBESS = () => (
  <svg width="26" height="40" viewBox="0 0 26 40">
    <rect x="3" y="6" width="20" height="31" rx="2" fill="none" stroke="#52c41a" strokeWidth="2" />
    <rect x="9" y="2" width="8" height="4" rx="1" fill="#52c41a" />
    <path d="M14 11 L9 22 L13 22 L11 33 L18 20 L14 20 Z" fill="#52c41a" />
  </svg>
);
const SvgArrow = () => (
  <svg width="26" height="8" viewBox="0 0 26 8">
    <path d="M1 4 L21 4 M17 1 L22 4 L17 7" stroke="#bfbfbf" strokeWidth="2" fill="none" strokeLinecap="round" />
  </svg>
);

/** 章节骨架：相对定位 + 右上角灰色栏目标签 + 结论式 H1 + 副标题 */
const sectionStyle: React.CSSProperties = { position: 'relative', minHeight: 1000, marginTop: 24 };

export default function ReportPanel() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const MONTHS = (t('results.months', { returnObjects: true }) as string[]) || ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

  const { results, scenarios, isRunning, baselines } = useSimulationStore();
  const { results: finResults } = useFinanceStore();
  const { params } = useParamsStore();
  const project = useProjectStore((s) => s.projects.find((p) => p.id === id));
  const {
    includeHW, customerName, companyName, scenarioId, displayCurrency, fxRate,
    setIncludeHW, setCustomerName, setCompanyName, setScenarioId, setDisplayCurrency, setFxRate,
  } = useReportStore();

  const [repMonth, setRepMonth] = useState(1);
  const [includeGreen, setIncludeGreen] = useState(params.greenPremium.enabled);
  const [includeOutage, setIncludeOutage] = useState(params.outageLoss.enabled);
  const [exporting, setExporting] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  // 多品牌（模块C）：报告章深入第一个勾选的对比品牌
  const { brands: brandConfigs, activeCompareIds } = useBrandStore();

  // 展示层币种换算（引擎保持 BRL，仅此层换算）
  const fx = useMemo(() => createReportFx(displayCurrency, fxRate), [displayCurrency, fxRate]);

  // 方案：null = NPV 最优档
  const autoBest = useMemo(
    () => (finResults && finResults.length > 0 ? finResults.reduce((a, b) => (a.npv > b.npv ? a : b)) : null),
    [finResults],
  );
  const sid = scenarioId ?? autoBest?.scenarioId;
  const sim = results?.find((r) => r.scenarioId === sid) ?? null;
  const fin = finResults?.find((r) => r.scenarioId === sid) ?? null;
  const scen = scenarios.find((s) => s.id === sid) ?? null;
  const monthResult = sim?.monthlyResults?.find((m) => m.month === repMonth);
  // 多品牌对比（模块C）：报告章深入第一个勾选的对比品牌（决策③：报告单品牌深入）
  const reportBrand = useMemo(() => {
    const baseline = brandConfigs.find((b) => b.isBaseline) ?? brandConfigs[0];
    const target = brandConfigs.find((b) => !b.isBaseline && activeCompareIds.includes(b.id))
      ?? brandConfigs.find((b) => b.id === 'HW');
    return baseline && target ? { baseline, target } : null;
  }, [brandConfigs, activeCompareIds]);
  const hw = includeHW && scen && fin && reportBrand && sim
    ? estimateBrandFinanceAnchored(
        params, scen, fin, reportBrand.baseline.params, reportBrand.target.params, sim,
        {
          npv10: computeTenYearMetrics(fin, sim.annual.pv_kWh, params.financial.discountRate).npv10,
          revenue10: computeTenYearMetrics(fin, sim.annual.pv_kWh, params.financial.discountRate).revenue10,
          opexYear1: fin.cashflow.find((r) => r.year === 1)?.opex ?? 0,
          throughput10: computeThroughput10Kwh(
            sim.monthlyResults.reduce((s, m) => s + (m.totals.bessDischarge_kWh || 0), 0),
            params.sohCurve,
          ),
        },
      )
    : null;

  const today = new Date().toISOString().slice(0, 10);

  const handleExport = async () => {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      const base = sanitizeFileName(customerName.trim() || project?.name || 'report');
      await exportBlocksPDF(reportRef.current, `PV-BESS-Proposal_${base}_${today}`, undefined, {
        footerLeft: fx.footerNote(),
        skipCover: true,
      });
      message.success(t('report.config.exportPdf') + ' ✓');
    } catch (err: any) {
      console.error('exportBlocksPDF failed:', err);
      message.error(String(err?.message || err));
    } finally {
      setExporting(false);
    }
  };

  if (isRunning) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin size="large" />
        <Text style={{ display: 'block', marginTop: 16 }}>{t('results.running')}</Text>
      </div>
    );
  }
  if (!sim || !fin || !scen) return <Empty description={t('results.noData')} />;

  const annual = sim.annual;
  const rte = params.bess.efficiencyCharge * params.bess.efficiencyDischarge;
  const outageDaysArr = params.grid.outage.eventDaysPerMonth;
  const outageDaysUniform = outageDaysArr.every((d) => d === outageDaysArr[0]);
  const outageDaysText = outageDaysUniform
    ? `${outageDaysArr[0]}`
    : `${Math.min(...outageDaysArr)}–${Math.max(...outageDaysArr)}`;
  const outageAnnualHours = (outageDaysArr.reduce((s, d) => s + d, 0) * params.grid.outage.eventMinutes) / 60;

  const capexPV = scen.pvCapacity_kWp * params.capex.pvCost_perkW;
  const capexBESS = scen.bessCapacity_kWh * params.capex.bessCost_perkWh;
  // 华为参考配置估算（封面规格卡；100kW 逆变器 + 241kWh 储能系统，向上取整保证覆盖）
  const hwInverters = Math.ceil(scen.pvCapacity_kWp / 100);
  const hwCabinets = Math.ceil(scen.bessCapacity_kWh / 241);
  // cashflow[0] 是 Y0（-CAPEX），"首年"取 year===1 行
  const firstYear = fin.cashflow.find((r) => r.year === 1) ?? fin.cashflow[0];
  // 投资收益 10 年口径（用户拍板：NPV/图/表全 10 年）
  const tenYear = computeTenYearMetrics(fin, annual.pv_kWh, params.financial.discountRate);
  const bd = fin.savingsBreakdown;
  const savingPct = (bd.total / Math.max(fin.baseline.annualTotal, 1)) * 100;
  // 峰谷价差（展示币种/kWh）
  const spread = fx.to(params.grid.peakPrice_perkWh - params.grid.offPeakPrice_perkWh).toFixed(3);

  // ── 能量流解读框数据（守恒三句；与桑基图同口径：PV 发电按可分配口径 = 自用+充电+弃电） ──
  const bessChargePv = sim.monthlyResults.reduce((s, m) => s + (m.totals.bessCharge_kWh || 0), 0);
  const gridCharge = annual.gridCharge_kWh || 0;
  const bessDischarge = sim.monthlyResults.reduce((s, m) => s + (m.totals.bessDischarge_kWh || 0), 0);
  const dieselKWh = sim.monthlyResults.reduce((s, m) => s + (m.totals.diesel_kWh || 0), 0);
  const chargeTotal = bessChargePv + gridCharge;
  const flowLoss = Math.max(chargeTotal - bessDischarge, 0);
  const gridToLoad = Math.max((annual.gridImport_kWh || 0) - gridCharge, 0);
  const loadTotal = annual.pvSelfUse_kWh + gridToLoad + bessDischarge + dieselKWh;
  // 部署前：负荷全部由电网+柴油承担（无 PV/储能）
  const gridShareBefore = loadTotal > 0 ? ((loadTotal - dieselKWh) / loadTotal) * 100 : 0;
  const gridShareAfter = loadTotal > 0 ? (gridToLoad / loadTotal) * 100 : 0;
  const flowRte = chargeTotal > 0 ? (bessDischarge / chargeTotal) * 100 : 0;
  const kwhFmt = (v: number) => Math.round(v).toLocaleString('en-US');
  // 桑基图 PV 节点的可分配口径（电网不可用时段的 PV 替代柴油，不在自用口径内）
  const pvAllocated = annual.pvSelfUse_kWh + bessChargePv + (annual.curtailment_kWh || 0);
  const pvSelfUsePct = pvAllocated > 0 ? (annual.pvSelfUse_kWh / pvAllocated) * 100 : 0;

  // 节省明细表：部署光储前 vs 部署光储后（费用对比）
  const savingsRows = [
    { key: 'grid', label: t('report.savings.gridEnergy'), before: fin.baseline.annualGridCost, after: annual.gridCost },
    { key: 'demand', label: t('report.savings.demand'), before: fin.baseline.annualDemandCharge, after: annual.demandChargeCost },
    { key: 'diesel', label: t('report.savings.diesel'), before: fin.baseline.annualDieselCost, after: annual.dieselCost },
    { key: 'total', label: t('report.savings.total'), before: fin.baseline.annualTotal, after: annual.totalEnergyCost },
  ];
  const savingsColumns = [
    { title: t('common.metric'), dataIndex: 'label', key: 'label' },
    {
      title: t('report.savings.before'), dataIndex: 'before', key: 'before', align: 'right' as const,
      render: (v: number) => fx.money(v),
    },
    {
      title: t('report.savings.after'), dataIndex: 'after', key: 'after', align: 'right' as const,
      render: (v: number) => fx.money(v),
    },
    {
      title: t('report.savings.saving'), key: 'saving', align: 'right' as const,
      render: (_: unknown, r: { before: number; after: number }) => (
        <Text strong style={{ color: '#389e0d' }}>{fx.money(r.before - r.after)}</Text>
      ),
    },
  ];

  // 节省四分量分解表（恒等式：a+b = 电量电费差，a+b+c+d = 总节省）
  const breakdownRows = [
    { key: 'a', label: t('report.savings.catPvSelfUse'), value: bd.pvSelfUse },
    { key: 'b', label: t('report.savings.catArbitrage'), value: bd.arbitrage },
    { key: 'c', label: t('report.savings.catDemand'), value: bd.demand },
    { key: 'd', label: t('report.savings.catDiesel'), value: bd.diesel },
    { key: 'total', label: t('report.savings.total'), value: bd.total },
  ];
  const breakdownColumns = [
    { title: t('report.savings.breakdownTitle'), dataIndex: 'label', key: 'label' },
    {
      title: t('report.savings.saving'), dataIndex: 'value', key: 'value', align: 'right' as const,
      render: (v: number, r: { key: string }) => (
        <Text strong={r.key === 'total'} style={{ color: '#389e0d' }}>{fx.money(v)}</Text>
      ),
    },
  ];

  /** 栏目标签（右上角灰色小字） */
  const secTag = (key: string) => (
    <span style={{
      position: 'absolute', top: 2, right: 6, fontSize: 10.5, color: '#bfbfbf',
      letterSpacing: 0.5, textTransform: 'uppercase',
    }}>
      {String(t(key))}
    </span>
  );

  /** 结论式章节标题：H1（左蓝竖条）+ 可选副标题依据行 */
  const secTitle = (titleKey: string, subKey?: string, vars?: Record<string, unknown>) => (
    <div style={{ marginBottom: 14 }}>
      <Title level={4} style={{ borderLeft: '4px solid #1677ff', paddingLeft: 10, marginTop: 0, marginBottom: subKey ? 2 : 0 }}>
        {String(t(titleKey, vars as any))}
      </Title>
      {subKey && (
        <div style={{ paddingLeft: 14, fontSize: 12, color: '#8c8c8c' }}>{String(t(subKey, vars as any))}</div>
      )}
    </div>
  );

  /** WHO/WHY/HOW 三卡 */
  const wwhCard = (titleKey: string, bodyKey: string, vars: Record<string, unknown>) => (
    <div style={{
      flex: 1, background: '#f5f7fa', borderRadius: 8, padding: '14px 16px', minHeight: 128,
    }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: '#1677ff', letterSpacing: 1.5, marginBottom: 8 }}>
        {String(t(titleKey))}
      </div>
      <div style={{ fontSize: 12.5, color: '#404040', lineHeight: 1.9, whiteSpace: 'pre-line' }}>
        {String(t(bodyKey, vars as any))}
      </div>
    </div>
  );

  return (
    <div>
      {/* ─── 配置区（不进截图） ─── */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap size={16}>
          <span>
            <Text type="secondary" style={{ marginRight: 6 }}>{t('report.config.scheme')}</Text>
            <Select
              style={{ width: 200 }}
              value={scenarioId ?? 'auto'}
              onChange={(v) => setScenarioId(v === 'auto' ? null : (v as number))}
              options={[
                { value: 'auto', label: `${t('report.config.autoBest')}${autoBest ? ` (#${autoBest.scenarioId})` : ''}` },
                ...scenarios.map((s) => ({ value: s.id, label: scenarioDisplayName(s, t) })),
              ]}
            />
          </span>
          <span>
            <Text type="secondary" style={{ marginRight: 6 }}>{t('report.config.customer')}</Text>
            <Input style={{ width: 160 }} placeholder={t('report.config.customerPh')} value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </span>
          <span>
            <Text type="secondary" style={{ marginRight: 6 }}>{t('report.config.company')}</Text>
            <Input style={{ width: 160 }} placeholder={t('report.config.companyPh')} value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </span>
          <span>
            <Text type="secondary" style={{ marginRight: 6 }}>{t('report.config.repMonth')}</Text>
            <Select
              style={{ width: 90 }}
              value={repMonth}
              onChange={setRepMonth}
              options={MONTHS.map((m, i) => ({ value: i + 1, label: m }))}
            />
          </span>
          <span>
            <Text type="secondary" style={{ marginRight: 6 }}>{t('report.config.currency')}</Text>
            <Select
              style={{ width: 92 }}
              value={displayCurrency}
              onChange={(v) => setDisplayCurrency(v as ReportCurrencyCode)}
              options={[{ value: 'BRL', label: 'BRL' }, { value: 'USD', label: 'USD' }]}
            />
          </span>
          {displayCurrency === 'USD' && (
            <span>
              <Text type="secondary" style={{ marginRight: 6 }}>{t('report.config.fxRate')}</Text>
              <InputNumber
                style={{ width: 110 }}
                min={0.0001}
                max={99.9999}
                step={0.0001}
                value={fxRate}
                onChange={(v) => setFxRate(typeof v === 'number' && v > 0 && v < 100 ? v : DEFAULT_FX_RATE)}
              />
            </span>
          )}
          <Checkbox checked={includeGreen} onChange={(e) => setIncludeGreen(e.target.checked)}>{t('report.includeGreen')}</Checkbox>
          <Checkbox checked={includeOutage} onChange={(e) => setIncludeOutage(e.target.checked)}>{t('report.includeOutage')}</Checkbox>
          <span>
            <Text type="secondary" style={{ marginRight: 6 }}>{t('report.compareWithHW')}</Text>
            <Switch checked={includeHW} onChange={setIncludeHW} />
          </span>
          <Button type="primary" icon={<DownloadOutlined />} loading={exporting} onClick={handleExport}>
            {exporting ? t('report.config.exporting') : t('report.config.exportPdf')}
          </Button>
        </Space>
      </Card>

      {/* ─── 预览区 = 截图源：强制浅色（cssVar 在 antd 6 不可关，var() 兼容由 pdf-blocks onclone 内联计算样式解决） ─── */}
      <ConfigProvider theme={{ algorithm: antdTheme.defaultAlgorithm, token: { colorPrimary: '#1677ff' } }}>
        <div
          ref={reportRef}
          style={{ background: '#ffffff', color: '#262626', width: 794, margin: '0 auto', padding: '32px 36px', boxShadow: '0 2px 12px rgba(0,0,0,0.15)' }}
        >
          {/* ① 封面（独占整页，深海军蓝头版） */}
          <CoverBlock
            t={t}
            projectName={project?.name ?? ''}
            scenName={scenarioDisplayName(scen, t)}
            scen={scen}
            today={today}
            currencyCode={displayCurrency}
            customerName={customerName}
            companyName={companyName}
            savingPct={savingPct}
            baselineAnnual={fin.baseline.annualTotal}
            firstYearNet={firstYear?.netCashflow ?? 0}
            paybackStatic={fin.paybackStatic}
            npv10={tenYear.npv10}
            lcoe10={tenYear.lcoe10}
            includeHW={includeHW}
            hwInverters={hwInverters}
            hwCabinets={hwCabinets}
            fx={fx}
          />

          {/* ② 案例定义（WHO/WHY/HOW 三卡 + 精简参数表） */}
          <section data-pdf-block style={sectionStyle}>
            {secTag('report.tag.case')}
            {secTitle('report.sec.caseTitle', 'report.sec.caseSub', {
              customer: customerName || project?.name || '—',
              pv: scen.pvCapacity_kWp,
              bess: scen.bessCapacity_kWh,
            })}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              {wwhCard('report.who.title', 'report.who.body', {
                customer: customerName || '—',
                company: companyName || '—',
                project: project?.name ?? '—',
                month: MONTHS[repMonth - 1],
              })}
              {wwhCard('report.why.title', 'report.why.body', {
                baseline: fx.money(fin.baseline.annualTotal),
                hours: outageAnnualHours.toFixed(0),
                spread, sym: fx.sym,
              })}
              {wwhCard('report.how.title', 'report.how.body', {
                pv: scen.pvCapacity_kWp,
                bess: scen.bessCapacity_kWh,
                pcs: scen.pcsPower_kW,
              })}
            </div>
            <Descriptions
              bordered
              size="small"
              column={2}
              items={[
                { key: 'pv', label: t('report.params.pvCap'), children: scen.pvCapacity_kWp },
                { key: 'bess', label: t('report.params.bessCap'), children: scen.bessCapacity_kWh },
                { key: 'pcs', label: t('report.params.pcs'), children: scen.pcsPower_kW },
                { key: 'rte', label: t('report.params.rte'), children: `${(rte * 100).toFixed(0)}%` },
                { key: 'soc', label: t('report.params.socWindow'), children: `${(params.bess.socMin * 100).toFixed(0)}%–${(params.bess.socMax * 100).toFixed(0)}%` },
                { key: 'cd', label: t('report.params.contractDemand'), children: params.grid.contractDemand_kW },
                { key: 'pp', label: t('report.params.touPeak'), children: `${fx.to(params.grid.peakPrice_perkWh).toFixed(3)} ${fx.sym}/kWh` },
                { key: 'op', label: t('report.params.touOffpeak'), children: `${fx.to(params.grid.offPeakPrice_perkWh).toFixed(3)} ${fx.sym}/kWh` },
                { key: 'dr', label: t('report.params.demandRate'), children: `${fx.to(params.grid.demandCharge_perKW).toFixed(2)} ${fx.sym}/kW·${t('common.perMonth')}` },
                { key: 'dp', label: t('report.params.demandPenalty'), children: `${fx.to(params.grid.excessDemandRate).toFixed(2)} ${fx.sym}/kW·${t('common.perMonth')}` },
                { key: 'om', label: t('report.params.outageModel'), children: t('report.params.outageModelValue', { days: outageDaysText, minutes: params.grid.outage.eventMinutes, start: params.grid.outage.windowStart, hours: outageAnnualHours.toFixed(1) }) },
                { key: 'dl', label: t('report.params.dieselPrice'), children: `${fx.to(params.diesel.fuelPrice_perL).toFixed(2)} ${fx.sym}/L` },
                { key: 'pl', label: t('report.params.projectLife'), children: `${params.financial.projectLife} ${t('common.years')}` },
                { key: 'dc', label: t('report.params.discountRate'), children: `${(params.financial.discountRate * 100).toFixed(0)}%` },
                { key: 'cpv', label: t('report.params.capexUnitPV'), children: `${fx.moneyFull(params.capex.pvCost_perkW)}/kWp` },
                { key: 'cb', label: t('report.params.capexUnitBESS'), children: `${fx.moneyFull(params.capex.bessCost_perkWh)}/kWh` },
              ]}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('report.params.pvNote', { kwp: scen.pvCapacity_kWp, area: Math.round(scen.pvCapacity_kWp * 10).toLocaleString() })}
              </Text>
            </div>
          </section>

          {/* ③ 运行策略 */}
          <section data-pdf-block style={sectionStyle}>
            {secTag('report.tag.dispatch')}
            {secTitle('report.sec.dispatchTitle', 'report.sec.dispatchSub', {
              spread, sym: fx.sym, month: MONTHS[repMonth - 1],
            })}
            <ul style={{ lineHeight: 1.9, paddingLeft: 20, marginTop: 0 }}>
              <li>{t('report.strategy.s1')}</li>
              <li>{t('report.strategy.s2')}</li>
              <li>{t('report.strategy.s3', { demand: params.grid.contractDemand_kW, threshold: Math.round(params.grid.contractDemand_kW * 0.5) })}</li>
              <li>{t('report.strategy.s9')}</li>
              <li>{t('report.strategy.s4', { start: params.grid.outage.windowStart, minutes: params.grid.outage.eventMinutes })}</li>
              <li>{t('report.strategy.s5')}</li>
              <li>{t('report.strategy.s6', { min: `${(params.bess.socMin * 100).toFixed(0)}%`, max: `${(params.bess.socMax * 100).toFixed(0)}%` })}</li>
              <li>{t('report.strategy.s7', { factor: Math.round((params.workDays.stoppageLoadFactor ?? 0.1) * 100) })}</li>
              <li>{t('report.strategy.s8', { peak: `${fx.to(params.grid.peakPrice_perkWh).toFixed(3)} ${fx.sym}`, offpeak: `${fx.to(params.grid.offPeakPrice_perkWh).toFixed(3)} ${fx.sym}` })}</li>
            </ul>
            <ReactECharts
              option={applyChartTextStyle(buildDispatchOption(t, monthResult, params.grid.contractDemand_kW, MONTHS[repMonth - 1], true), CHART_TEXT_LIGHT_BG)}
              style={{ height: 340 }}
            />
          </section>

          {/* ④ 节省明细 */}
          <section data-pdf-block style={sectionStyle}>
            {secTag('report.tag.savings')}
            {secTitle('report.sec.savingsTitleNew', 'report.sec.savingsSub', {
              v: fx.money(bd.total), pct: savingPct.toFixed(0),
            })}
            {/* RR 案例风格：部署前后对比卡（数字取自已计算结果，仅表达形式新增） */}
            <Row gutter={16} style={{ marginBottom: 14 }}>
              <Col span={11}>
                <div style={{ border: '1px solid #d9d9d9', borderRadius: 8, padding: '12px 16px' }}>
                  <Text strong style={{ fontSize: 14 }}>{t('report.savings.cardsBefore')}</Text>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0', justifyContent: 'center' }}>
                    <SvgGrid /><SvgArrow /><SvgFactory />
                  </div>
                  <div style={{ fontSize: 12.5, color: '#595959' }}>{t('report.savings.cardsGridOnly')}</div>
                  <div style={{ marginTop: 4, fontSize: 13 }}>
                    {t('report.savings.cardsAnnualCost')}：
                    <Text strong style={{ fontSize: 15 }}>{fx.money(fin.baseline.annualTotal)}</Text>
                  </div>
                </div>
              </Col>
              <Col span={13}>
                <div style={{ border: '1px solid #b7eb8f', background: '#f6ffed', borderRadius: 8, padding: '12px 16px', position: 'relative' }}>
                  <span style={{
                    position: 'absolute', top: 10, right: 12, background: '#389e0d', color: '#fff',
                    fontSize: 12, fontWeight: 700, borderRadius: 10, padding: '2px 10px',
                  }}>
                    {t('report.savings.cardsBadge', { pct: savingPct.toFixed(0) })}
                  </span>
                  <Text strong style={{ fontSize: 14 }}>{t('report.savings.cardsAfter')}</Text>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0', justifyContent: 'center' }}>
                    <SvgPV /><SvgBESS /><SvgGrid /><SvgArrow /><SvgFactory />
                  </div>
                  <div style={{ fontSize: 12.5, color: '#595959' }}>
                    PV {scen.pvCapacity_kWp} kWp · BESS {scen.bessCapacity_kWh} kWh / {scen.pcsPower_kW} kW
                  </div>
                  <div style={{ marginTop: 4, fontSize: 13 }}>
                    {t('report.savings.cardsAnnualCost')}：
                    <Text strong style={{ fontSize: 15 }}>{fx.money(annual.totalEnergyCost)}</Text>
                    <span style={{ margin: '0 8px', color: '#bfbfbf' }}>|</span>
                    {t('report.savings.cardsAnnualSaving')}：
                    <Text strong style={{ fontSize: 15, color: '#389e0d' }}>{fx.money(bd.total)}</Text>
                  </div>
                </div>
              </Col>
            </Row>
            {/* RR 案例风格：年度费用构成对比（横向堆叠条 + 净节省标注） */}
            <ReactECharts
              option={applyChartTextStyle(buildCostCompareOption(t, fin, annual, firstYear?.opex ?? 0, fx.sym), CHART_TEXT_LIGHT_BG)}
              style={{ height: 210 }}
            />
            <Table
              size="small"
              pagination={false}
              dataSource={savingsRows}
              columns={savingsColumns}
              style={{ marginBottom: 10 }}
            />
            <Table
              size="small"
              pagination={false}
              dataSource={breakdownRows}
              columns={breakdownColumns}
              style={{ marginBottom: 10 }}
            />
            {(includeGreen && fin.greenPremium) && (
              <div>+ {t('report.savings.greenRow')}：{fx.money(fin.greenPremium.annualPremium)}/{t('common.perYear')}</div>
            )}
            {(includeOutage && fin.outageLoss) && (
              <div>+ {t('report.savings.outageRow')}：{fx.money(fin.outageLoss.annualLoss)}（{fin.outageLoss.totalUnserved_hours.toFixed(1)} h）</div>
            )}
            <Row gutter={16} style={{ textAlign: 'center', margin: '12px 0' }}>
              <Col span={8}><Statistic title={t('report.savings.firstYearTotal')} value={fx.money(fin.annualRevenue)} /></Col>
              <Col span={8}><Statistic title={t('report.savings.firstYearOpex')} value={fx.money(firstYear?.opex ?? 0)} /></Col>
              <Col span={8}><Statistic title={t('report.savings.firstYearNet')} value={fx.money(firstYear?.netCashflow ?? 0)} /></Col>
            </Row>
            <ReactECharts
              option={applyChartTextStyle(buildMonthlySavingOption(t, sim.monthlyResults, params, MONTHS, baselines?.[0]), CHART_TEXT_LIGHT_BG)}
              style={{ height: 260 }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>{t('report.savings.note')}</Text>
          </section>

          {/* ⑤ 能量流（桑基 + 守恒解读框） */}
          <section data-pdf-block style={sectionStyle}>
            {secTag('report.tag.flow')}
            {secTitle('report.sec.flowTitle', 'report.sec.flowSub', { pct: pvSelfUsePct.toFixed(0) })}
            <ReactECharts
              option={applyChartTextStyle(buildSankeyOption(t, annual, sim.monthlyResults, { mode: 'year' }), CHART_TEXT_LIGHT_BG)}
              style={{ height: 360 }}
            />
            <div style={{
              background: '#f5f7fa', borderLeft: '3px solid #1677ff', borderRadius: 4,
              padding: '12px 16px', marginTop: 12,
            }}>
              <div style={{ fontSize: 12.5, color: '#404040', lineHeight: 2 }}>
                <div>{t('report.flow.reading1', { pv: kwhFmt(pvAllocated), self: kwhFmt(annual.pvSelfUse_kWh), charge: kwhFmt(bessChargePv), curtail: kwhFmt(annual.curtailment_kWh || 0) })}</div>
                <div>{t('report.flow.reading2', { charge: kwhFmt(chargeTotal), discharge: kwhFmt(bessDischarge), loss: kwhFmt(flowLoss), rte: flowRte.toFixed(0) })}</div>
                <div>{t('report.flow.reading3', { load: kwhFmt(loadTotal), before: gridShareBefore.toFixed(0), after: gridShareAfter.toFixed(0) })}</div>
              </div>
            </div>
          </section>

          {/* ⑥ 投资收益（红绿分区 + Y0–Y10 现金流表） */}
          <section data-pdf-block style={sectionStyle}>
            {secTag('report.tag.invest')}
            {secTitle('report.sec.investTitleNew', 'report.sec.investSub', {
              years: fin.paybackStatic.toFixed(2),
              y: Math.floor(fin.paybackStatic) + 1,
              npv: fx.money(tenYear.npv10),
            })}
            <InvestBlock t={t} fin={fin} capexPV={capexPV} capexBESS={capexBESS} fx={fx} />
          </section>

          {/* ⑦ HW 增量价值（includeHW 时；双瀑布 + 深色结论框） */}
          {hw && (
            <section data-pdf-block style={sectionStyle}>
              {secTag('report.tag.hw')}
              {secTitle('report.sec.hwTitleNew', 'report.sec.hwSub', {
                brand: reportBrand!.target.label,
                v: fx.money(hw.npv10 - tenYear.npv10),
              })}
              <HwSection
                t={t}
                params={params}
                scen={scen}
                fin={fin}
                sim={sim}
                baseline={reportBrand!.baseline.params}
                target={reportBrand!.target.params}
                targetLabel={reportBrand!.target.label}
                hw={hw}
                tenYear={tenYear}
                firstYearOpex={firstYear?.opex ?? 0}
                fx={fx}
              />
            </section>
          )}
        </div>
      </ConfigProvider>
    </div>
  );
}
