/**
 * 投资报告面板：配置区（方案/客户/代表月/开关）+ 白底预览区（即 PDF 截图源）+ 导出。
 * 预览区嵌套 ConfigProvider 关闭 cssVar 并强制浅色——antd 6 默认 CSS 变量模式，
 * html2canvas 对 var(--ant-*) 支持不全，必须回退内联 hex。
 * 华为章（includeHW）在第七个 data-pdf-block，由 useReportStore.includeHW 控制（需求②）。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Button, Card, Checkbox, Col, ConfigProvider, Descriptions, Empty, Input, Row,
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
import { BrandMap, FALLBACK_BRANDS, loadBrandParams, estimateHWFinance, computeThroughput10Kwh } from '../../utils/brand';
import { exportBlocksPDF } from '../../utils/pdf-blocks';
import {
  buildDispatchOption, buildMonthlySavingOption, buildSankeyOption,
  buildCostCompareOption, buildCumCostCompareOption,
  computeTenYearMetrics,
} from '../../utils/report-charts';

const { Title, Text } = Typography;

const fmtMoney = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return v.toFixed(0);
};

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

export default function ReportPanel() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const MONTHS = (t('results.months', { returnObjects: true }) as string[]) || ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

  const { results, scenarios, isRunning, baselines } = useSimulationStore();
  const { results: finResults } = useFinanceStore();
  const { params } = useParamsStore();
  const project = useProjectStore((s) => s.projects.find((p) => p.id === id));
  const {
    includeHW, customerName, companyName, scenarioId,
    setIncludeHW, setCustomerName, setCompanyName, setScenarioId,
  } = useReportStore();

  const [repMonth, setRepMonth] = useState(1);
  const [includeGreen, setIncludeGreen] = useState(params.greenPremium.enabled);
  const [includeOutage, setIncludeOutage] = useState(params.outageLoss.enabled);
  const [exporting, setExporting] = useState(false);
  const [brands, setBrands] = useState<BrandMap>(FALLBACK_BRANDS);
  const reportRef = useRef<HTMLDivElement>(null);

  // 品牌参数：Supabase 优先，失败降级内置（与 ComparePanel 同口径）
  useEffect(() => {
    let cancelled = false;
    loadBrandParams().then(({ brands: b }) => { if (!cancelled) setBrands(b); });
    return () => { cancelled = true; };
  }, []);

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
  // 华为对比：打开 Switch（报告页或对比页均可，共享 useReportStore）→ 报告含华为章（需求②）
  const hw = includeHW && scen && fin ? estimateHWFinance(params, scen, fin, brands, sim) : null;

  const sym = params.currency.symbol;
  const today = new Date().toISOString().slice(0, 10);

  const handleExport = async () => {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      const base = sanitizeFileName(customerName.trim() || project?.name || 'report');
      await exportBlocksPDF(reportRef.current, `PV-BESS-Proposal_${base}_${today}`);
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
  // 华为参考配置估算（封面展示；100kW 逆变器 + 241kWh 储能系统，向上取整保证覆盖）
  const hwInverters = Math.ceil(scen.pvCapacity_kWp / 100);
  const hwCabinets = Math.ceil(scen.bessCapacity_kWh / 241);
  // cashflow[0] 是 Y0（-CAPEX），"首年"取 year===1 行
  const firstYear = fin.cashflow.find((r) => r.year === 1) ?? fin.cashflow[0];
  // 投资收益 10 年口径（用户拍板：NPV/图/表全 10 年）
  const tenYear = computeTenYearMetrics(fin, annual.pv_kWh, params.financial.discountRate);

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
      render: (v: number) => `${fmtMoney(v)} ${sym}`,
    },
    {
      title: t('report.savings.after'), dataIndex: 'after', key: 'after', align: 'right' as const,
      render: (v: number) => `${fmtMoney(v)} ${sym}`,
    },
    {
      title: t('report.savings.saving'), key: 'saving', align: 'right' as const,
      render: (_: unknown, r: { before: number; after: number }) => (
        <Text strong style={{ color: '#389e0d' }}>{fmtMoney(r.before - r.after)} {sym}</Text>
      ),
    },
  ];

  // 节省四分量分解表（恒等式：a+b = 电量电费差，a+b+c+d = 总节省）
  const bd = fin.savingsBreakdown;
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
        <Text strong={r.key === 'total'} style={{ color: '#389e0d' }}>{fmtMoney(v)} {sym}</Text>
      ),
    },
  ];

  const cashflowColumns = [
    { title: t('report.invest.year'), dataIndex: 'year', key: 'year', width: 70, render: (v: number) => `Y${v}` },
    { title: t('report.invest.revenue'), dataIndex: 'totalRevenue', key: 'rev', align: 'right' as const, render: (v: number) => fmtMoney(v) },
    { title: t('report.invest.opex'), dataIndex: 'opex', key: 'opex', align: 'right' as const, render: (v: number) => fmtMoney(v) },
    { title: t('report.invest.net'), dataIndex: 'netCashflow', key: 'net', align: 'right' as const, render: (v: number) => fmtMoney(v) },
    { title: t('report.invest.cumDiscounted'), dataIndex: 'cumulativeDiscountedCF', key: 'cum', align: 'right' as const, render: (v: number) => fmtMoney(v) },
  ];

  const secTitle = (key: string) => (
    <Title level={4} style={{ borderLeft: '4px solid #1677ff', paddingLeft: 10, marginTop: 0 }}>{t(key)}</Title>
  );

  return (
    <div>
      {/* ─── 配置区（不进截图） ─── */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap size={16}>
          <span>
            <Text type="secondary" style={{ marginRight: 6 }}>{t('report.config.scheme')}</Text>
            <Select
              style={{ width: 220 }}
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
            <Input style={{ width: 180 }} placeholder={t('report.config.customerPh')} value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </span>
          <span>
            <Text type="secondary" style={{ marginRight: 6 }}>{t('report.config.company')}</Text>
            <Input style={{ width: 180 }} placeholder={t('report.config.companyPh')} value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </span>
          <span>
            <Text type="secondary" style={{ marginRight: 6 }}>{t('report.config.repMonth')}</Text>
            <Select
              style={{ width: 100 }}
              value={repMonth}
              onChange={setRepMonth}
              options={MONTHS.map((m, i) => ({ value: i + 1, label: m }))}
            />
          </span>
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
          {/* ① 封面（独占整页；高度≈版心 A4 比例 515.28:761.89） */}
          <section
            data-pdf-block
            data-pdf-cover
            style={{ minHeight: 1068, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '40px 24px' }}
          >
            <div style={{ textAlign: 'center', marginTop: 120 }}>
              <Title style={{ fontSize: 40, marginBottom: 8 }}>{t('report.cover.title')}</Title>
              <Text style={{ fontSize: 16, color: '#595959' }}>{t('report.cover.subtitle')}</Text>
              <div style={{ margin: '36px auto 0', width: 120, borderTop: '3px solid #1677ff' }} />
              <Title level={3} style={{ marginTop: 36 }}>{project?.name ?? ''}</Title>
              <Text style={{ fontSize: 15 }}>{scenarioDisplayName(scen, t)}</Text>
              {/* 华为参考配置估算（随 includeHW 显隐，与第六章联动） */}
              {includeHW && (
                <div style={{ marginTop: 20 }}>
                  <div style={{
                    display: 'inline-block', border: '1px solid #91caff', background: '#f0f7ff',
                    borderRadius: 8, padding: '10px 20px',
                  }}>
                    <Text style={{ fontSize: 12, color: '#0958d9', display: 'block', marginBottom: 4 }}>
                      {t('report.cover.hwConfigTitle')}
                    </Text>
                    <Text style={{ fontSize: 14.5, fontWeight: 600, color: '#262626' }}>
                      {t('report.cover.hwInv', { n: hwInverters })}
                      <span style={{ margin: '0 10px', color: '#bfbfbf' }}>·</span>
                      {t('report.cover.hwCab', { n: hwCabinets, total: hwCabinets * 241 })}
                    </Text>
                  </div>
                </div>
              )}
            </div>
            <div>
              <Row gutter={16} style={{ textAlign: 'center', marginBottom: 60 }}>
                <Col span={6}><Statistic title={t('report.invest.npv10')} value={fmtMoney(tenYear.npv10)} suffix={sym} /></Col>
                <Col span={6}><Statistic title={t('report.invest.pbp')} value={fin.paybackStatic.toFixed(1)} suffix={t('common.years')} /></Col>
                <Col span={6}><Statistic title={t('report.invest.lcoe10')} value={tenYear.lcoe10.toFixed(2)} suffix={`${sym}/kWh`} /></Col>
                <Col span={6}><Statistic title={t('report.savings.firstYearNet')} value={fmtMoney(firstYear?.netCashflow ?? 0)} suffix={sym} /></Col>
              </Row>
              <div style={{ textAlign: 'center', color: '#595959', lineHeight: 2 }}>
                <div>{t('report.cover.preparedFor')}：{customerName || '—'}</div>
                <div>{t('report.cover.preparedBy')}：{companyName || '—'}</div>
                <div>{t('report.date')}：{today}</div>
                <div>{t('report.cover.currencyNote', { currency: params.currency.code })}</div>
              </div>
            </div>
          </section>

          {/* ② 系统参数 */}
          <section data-pdf-block style={{ marginTop: 24 }}>
            {secTitle('report.sec.params')}
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
                { key: 'pp', label: t('report.params.touPeak'), children: `${params.grid.peakPrice_perkWh} ${sym}/kWh` },
                { key: 'op', label: t('report.params.touOffpeak'), children: `${params.grid.offPeakPrice_perkWh} ${sym}/kWh` },
                { key: 'dr', label: t('report.params.demandRate'), children: `${params.grid.demandCharge_perKW} ${sym}/kW·${t('common.perMonth')}` },
                { key: 'dp', label: t('report.params.demandPenalty'), children: `${params.grid.excessDemandRate} ${sym}/kW·${t('common.perMonth')}` },
                { key: 'om', label: t('report.params.outageModel'), children: t('report.params.outageModelValue', { days: outageDaysText, minutes: params.grid.outage.eventMinutes, start: params.grid.outage.windowStart, hours: outageAnnualHours.toFixed(1) }) },
                { key: 'dl', label: t('report.params.dieselPrice'), children: `${params.diesel.fuelPrice_perL} ${sym}/L` },
                { key: 'pl', label: t('report.params.projectLife'), children: `${params.financial.projectLife} ${t('common.years')}` },
                { key: 'dc', label: t('report.params.discountRate'), children: `${(params.financial.discountRate * 100).toFixed(0)}%` },
                { key: 'cpv', label: t('report.params.capexUnitPV'), children: `${params.capex.pvCost_perkW} ${sym}/kWp` },
                { key: 'cb', label: t('report.params.capexUnitBESS'), children: `${params.capex.bessCost_perkWh} ${sym}/kWh` },
              ]}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('report.params.pvNote', { kwp: scen.pvCapacity_kWp, area: Math.round(scen.pvCapacity_kWp * 10).toLocaleString() })}
              </Text>
            </div>
          </section>

          {/* ③ 运行策略 */}
          <section data-pdf-block style={{ marginTop: 24 }}>
            {secTitle('report.sec.strategy')}
            <ul style={{ lineHeight: 1.9, paddingLeft: 20, marginTop: 0 }}>
              <li>{t('report.strategy.s1')}</li>
              <li>{t('report.strategy.s2')}</li>
              <li>{t('report.strategy.s3', { demand: params.grid.contractDemand_kW, threshold: Math.round(params.grid.contractDemand_kW * 0.5) })}</li>
              <li>{t('report.strategy.s9')}</li>
              <li>{t('report.strategy.s4', { start: params.grid.outage.windowStart, minutes: params.grid.outage.eventMinutes })}</li>
              <li>{t('report.strategy.s5')}</li>
              <li>{t('report.strategy.s6', { min: `${(params.bess.socMin * 100).toFixed(0)}%`, max: `${(params.bess.socMax * 100).toFixed(0)}%` })}</li>
              <li>{t('report.strategy.s7', { factor: Math.round((params.workDays.stoppageLoadFactor ?? 0.1) * 100) })}</li>
              <li>{t('report.strategy.s8', { peak: `${params.grid.peakPrice_perkWh} ${sym}`, offpeak: `${params.grid.offPeakPrice_perkWh} ${sym}` })}</li>
            </ul>
            <ReactECharts
              option={buildDispatchOption(t, monthResult, params.grid.contractDemand_kW, MONTHS[repMonth - 1], true)}
              style={{ height: 340 }}
            />
          </section>

          {/* ④ 节省明细 */}
          <section data-pdf-block style={{ marginTop: 24 }}>
            {secTitle('report.sec.savings')}
            {/* RR 案例风格：部署前后对比卡（数字取自已计算结果，仅表达形式新增） */}
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={11}>
                <div style={{ border: '1px solid #d9d9d9', borderRadius: 8, padding: '14px 16px' }}>
                  <Text strong style={{ fontSize: 14 }}>{t('report.savings.cardsBefore')}</Text>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0', justifyContent: 'center' }}>
                    <SvgGrid /><SvgArrow /><SvgFactory />
                  </div>
                  <div style={{ fontSize: 12.5, color: '#595959' }}>{t('report.savings.cardsGridOnly')}</div>
                  <div style={{ marginTop: 6, fontSize: 13 }}>
                    {t('report.savings.cardsAnnualCost')}：
                    <Text strong style={{ fontSize: 15 }}>{fmtMoney(fin.baseline.annualTotal)} {sym}</Text>
                  </div>
                </div>
              </Col>
              <Col span={13}>
                <div style={{ border: '1px solid #b7eb8f', background: '#f6ffed', borderRadius: 8, padding: '14px 16px', position: 'relative' }}>
                  <span style={{
                    position: 'absolute', top: 10, right: 12, background: '#389e0d', color: '#fff',
                    fontSize: 12, fontWeight: 700, borderRadius: 10, padding: '2px 10px',
                  }}>
                    {t('report.savings.cardsBadge', { pct: Math.round((bd.total / Math.max(fin.baseline.annualTotal, 1)) * 100) })}
                  </span>
                  <Text strong style={{ fontSize: 14 }}>{t('report.savings.cardsAfter')}</Text>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0', justifyContent: 'center' }}>
                    <SvgPV /><SvgBESS /><SvgGrid /><SvgArrow /><SvgFactory />
                  </div>
                  <div style={{ fontSize: 12.5, color: '#595959' }}>
                    PV {scen.pvCapacity_kWp} kWp · BESS {scen.bessCapacity_kWh} kWh / {scen.pcsPower_kW} kW
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13 }}>
                    {t('report.savings.cardsAnnualCost')}：
                    <Text strong style={{ fontSize: 15 }}>{fmtMoney(annual.totalEnergyCost)} {sym}</Text>
                    <span style={{ margin: '0 8px', color: '#bfbfbf' }}>|</span>
                    {t('report.savings.cardsAnnualSaving')}：
                    <Text strong style={{ fontSize: 15, color: '#389e0d' }}>{fmtMoney(bd.total)} {sym}</Text>
                  </div>
                </div>
              </Col>
            </Row>
            {/* RR 案例风格：年度费用构成对比（横向堆叠条 + 净节省标注） */}
            <ReactECharts
              option={buildCostCompareOption(t, fin, annual, firstYear?.opex ?? 0, sym)}
              style={{ height: 230 }}
            />
            <Table
              size="small"
              pagination={false}
              dataSource={savingsRows}
              columns={savingsColumns}
              style={{ marginBottom: 12 }}
            />
            <Table
              size="small"
              pagination={false}
              dataSource={breakdownRows}
              columns={breakdownColumns}
              style={{ marginBottom: 12 }}
            />
            {(includeGreen && fin.greenPremium) && (
              <div>+ {t('report.savings.greenRow')}：{fmtMoney(fin.greenPremium.annualPremium)} {sym}/{t('common.perYear')}</div>
            )}
            {(includeOutage && fin.outageLoss) && (
              <div>+ {t('report.savings.outageRow')}：{fmtMoney(fin.outageLoss.annualLoss)} {sym}（{fin.outageLoss.totalUnserved_hours.toFixed(1)} h）</div>
            )}
            <Row gutter={16} style={{ textAlign: 'center', margin: '16px 0' }}>
              <Col span={8}><Statistic title={t('report.savings.firstYearTotal')} value={fmtMoney(fin.annualRevenue)} suffix={sym} /></Col>
              <Col span={8}><Statistic title={t('report.savings.firstYearOpex')} value={fmtMoney(firstYear?.opex ?? 0)} suffix={sym} /></Col>
              <Col span={8}><Statistic title={t('report.savings.firstYearNet')} value={fmtMoney(firstYear?.netCashflow ?? 0)} suffix={sym} /></Col>
            </Row>
            <ReactECharts
              option={buildMonthlySavingOption(t, sim.monthlyResults, params, MONTHS, baselines?.[0])}
              style={{ height: 300 }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>{t('report.savings.note')}</Text>
          </section>

          {/* ⑤ 能量流 */}
          <section data-pdf-block style={{ marginTop: 24 }}>
            {secTitle('report.sec.energyFlow')}
            <ReactECharts
              option={buildSankeyOption(t, annual, sim.monthlyResults)}
              style={{ height: 380 }}
            />
          </section>

          {/* ⑥ 投资收益 */}
          <section data-pdf-block style={{ marginTop: 24 }}>
            {secTitle('report.sec.invest')}
            <Row gutter={16} style={{ textAlign: 'center', marginBottom: 12 }}>
              <Col span={8}><Statistic title={t('report.invest.capexPV')} value={fmtMoney(capexPV)} suffix={sym} /></Col>
              <Col span={8}><Statistic title={t('report.invest.capexBESS')} value={fmtMoney(capexBESS)} suffix={sym} /></Col>
              <Col span={8}><Statistic title={t('report.invest.capexTotal')} value={fmtMoney(fin.capex)} suffix={sym} /></Col>
            </Row>
            <Row gutter={16} style={{ textAlign: 'center', marginBottom: 12 }}>
              <Col span={8}><Statistic title={t('report.invest.npv10')} value={fmtMoney(tenYear.npv10)} suffix={sym} /></Col>
              <Col span={8}><Statistic title={t('report.invest.pbp')} value={fin.paybackStatic.toFixed(2)} suffix={t('common.years')} /></Col>
              <Col span={8}><Statistic title={t('report.invest.lcoe10')} value={tenYear.lcoe10.toFixed(2)} suffix={`${sym}/kWh`} /></Col>
            </Row>
            <ReactECharts
              option={buildCumCostCompareOption(t, fin, annual.totalEnergyCost, params.financial.priceGrowth, 10, sym)}
              style={{ height: 300 }}
            />
            <Title level={5} style={{ marginTop: 16 }}>{t('report.invest.cashflowTable10')}</Title>
            <Table
              size="small"
              pagination={false}
              dataSource={fin.cashflow.filter((r) => r.year <= 10).map((r) => ({ ...r, key: r.year }))}
              columns={cashflowColumns}
            />
          </section>

          {/* ⑦ 华为储能额外收益（includeHW 时；对比页 Switch 共享同一 store，需求②；无能量流，10 年口径） */}
          {hw && (
            <section data-pdf-block style={{ marginTop: 24 }}>
              {secTitle('report.sec.hw')}
              {(() => {
                const ind = brands.industry_avg;
                const hwB = brands.HW;
                const pct = (v: number) => (v * 100).toFixed(0);
                const indLoss = (1 - ind.rte) * 100;
                const hwLoss = (1 - hwB.rte) * 100;
                const sohY10 = (arr: number[]) => arr[9] ?? 0;
                // 行业侧 10 年口径与放电吞吐
                const opexInd1 = firstYear?.opex ?? 0;
                const annualDischarge = sim.monthlyResults.reduce((s, m) => s + (m.totals.bessDischarge_kWh || 0), 0);
                const throughput10Ind = computeThroughput10Kwh(annualDischarge, params.sohCurve);

                const paramRows = [
                  { key: 'rte', metric: `${t('compare.rte')} (RTE)`, industry: `${pct(ind.rte)}%`, hw: `${pct(hwB.rte)}%` },
                  { key: 'dod', metric: t('compare.dod'), industry: `${pct(ind.dod)}%`, hw: `${pct(hwB.dod)}%` },
                  { key: 'days', metric: t('compare.operatingDays'), industry: `${ind.operatingDaysPerYear}`, hw: `${hwB.operatingDaysPerYear}` },
                  { key: 'soh10', metric: t('compare.sohY10'), industry: `${pct(sohY10(ind.sohCurve))}%`, hw: `${pct(sohY10(hwB.sohCurve))}%` },
                  { key: 'opex', metric: t('compare.opexYear1'), industry: `${fmtMoney(opexInd1)} ${sym}`, hw: `${fmtMoney(hw.opexYear1)} ${sym}` },
                  { key: 'cost', metric: t('compare.fullPackageCost'), industry: `${fmtMoney(ind.costPerKWh)} ${sym}/kWh`, hw: `${fmtMoney(hwB.costPerKWh)} ${sym}/kWh` },
                ];
                const brandCols = [
                  { title: t('common.metric'), dataIndex: 'metric', key: 'metric' },
                  { title: t('compare.industry'), dataIndex: 'industry', key: 'industry', align: 'right' as const },
                  { title: t('compare.hw'), dataIndex: 'hw', key: 'hw', align: 'right' as const },
                ];
                const finRows = [
                  { key: 'capex', metric: t('finance.table.capex'), industry: fmtMoney(fin.capex), hw: fmtMoney(hw.capex), delta: fmtMoney(hw.capex - fin.capex) },
                  { key: 'opex', metric: t('compare.opexYear1'), industry: fmtMoney(opexInd1), hw: fmtMoney(hw.opexYear1), delta: fmtMoney(hw.opexYear1 - opexInd1) },
                  { key: 'rev10', metric: t('compare.revenue10'), industry: fmtMoney(tenYear.revenue10), hw: fmtMoney(hw.revenue10), delta: fmtMoney(hw.revenue10 - tenYear.revenue10) },
                  { key: 'npv10', metric: t('compare.npv10'), industry: fmtMoney(tenYear.npv10), hw: fmtMoney(hw.npv10), delta: fmtMoney(hw.npv10 - tenYear.npv10) },
                  { key: 'pbp', metric: t('finance.table.paybackStatic'), industry: fin.paybackStatic.toFixed(2), hw: hw.paybackStatic.toFixed(2), delta: (hw.paybackStatic - fin.paybackStatic).toFixed(2) },
                ];
                const finCols = [
                  { title: t('common.metric'), dataIndex: 'metric', key: 'metric' },
                  { title: t('compare.industry'), dataIndex: 'industry', key: 'industry', align: 'right' as const },
                  { title: t('compare.hw'), dataIndex: 'hw', key: 'hw', align: 'right' as const },
                  { title: 'Δ', dataIndex: 'delta', key: 'delta', align: 'right' as const,
                    render: (v: string) => <Text strong style={{ color: '#722ed1' }}>{v}</Text> },
                ];
                const thrRows = [
                  { key: 'thr', metric: t('compare.throughput10'), industry: `${(throughput10Ind / 1000).toFixed(0)} MWh`, hw: `${(hw.throughput10 / 1000).toFixed(0)} MWh`, delta: `+${((hw.throughput10 - throughput10Ind) / 1000).toFixed(0)} MWh` },
                ];

                return (
                  <>
                    <Title level={5}>{t('report.hw.paramTitle')}</Title>
                    <Table size="small" pagination={false} dataSource={paramRows} columns={brandCols} style={{ marginBottom: 12 }} />

                    <Title level={5}>{t('report.hw.strategyDiffTitle')}</Title>
                    <ul style={{ lineHeight: 1.9, paddingLeft: 20 }}>
                      <li>{t('report.hw.d1', { hw: pct(hwB.rte), ind: pct(ind.rte), indLoss: indLoss.toFixed(0), hwLoss: hwLoss.toFixed(0) })}</li>
                      <li>{t('report.hw.d2', { hwDod: pct(hwB.dod), indDod: pct(ind.dod), hwDays: hwB.operatingDaysPerYear, indDays: ind.operatingDaysPerYear })}</li>
                      <li>{t('report.hw.d3', { hwSoh: pct(sohY10(hwB.sohCurve)), indSoh: pct(sohY10(ind.sohCurve)) })}</li>
                    </ul>

                    <Title level={5}>{t('report.hw.throughputTitle')}</Title>
                    <Table size="small" pagination={false} dataSource={thrRows} columns={finCols} style={{ marginBottom: 12 }} />

                    <Title level={5}>{t('report.hw.savingTitle')}</Title>
                    <Table size="small" pagination={false} dataSource={finRows} columns={finCols} style={{ marginBottom: 12 }} />

                    <div style={{ marginTop: 12 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>{t('report.hw.financeNote')}</Text>
                    </div>
                  </>
                );
              })()}
            </section>
          )}
        </div>
      </ConfigProvider>
    </div>
  );
}
