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
import { BrandMap, FALLBACK_BRANDS, loadBrandParams, estimateHWFinance } from '../../utils/brand';
import { exportBlocksPDF } from '../../utils/pdf-blocks';
import {
  buildDispatchOption, buildMonthlySavingOption, buildSankeyOption, buildCumCashflowOption,
} from '../../utils/report-charts';

const { Title, Text } = Typography;

const fmtMoney = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return v.toFixed(0);
};

const sanitizeFileName = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60);

export default function ReportPanel() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const MONTHS = (t('results.months', { returnObjects: true }) as string[]) || ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

  const { results, scenarios, isRunning } = useSimulationStore();
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
  const hw = includeHW && scen && fin ? estimateHWFinance(params, scen, fin, brands) : null;

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
  // cashflow[0] 是 Y0（-CAPEX），"首年"取 year===1 行
  const firstYear = fin.cashflow.find((r) => r.year === 1) ?? fin.cashflow[0];

  // 节省明细表：基线 vs 方案
  const savingsRows = [
    { key: 'grid', label: t('report.savings.gridEnergy'), baseline: fin.baseline.annualGridCost, project: annual.gridCost },
    { key: 'demand', label: t('report.savings.demand'), baseline: fin.baseline.annualDemandCharge, project: annual.demandChargeCost },
    { key: 'diesel', label: t('report.savings.diesel'), baseline: fin.baseline.annualDieselCost, project: annual.dieselCost },
    { key: 'total', label: t('report.savings.total'), baseline: fin.baseline.annualTotal, project: annual.totalEnergyCost },
  ];
  const savingsColumns = [
    { title: t('common.metric'), dataIndex: 'label', key: 'label' },
    {
      title: t('report.savings.baseline'), dataIndex: 'baseline', key: 'baseline', align: 'right' as const,
      render: (v: number) => `${fmtMoney(v)} ${sym}`,
    },
    {
      title: t('report.savings.project'), dataIndex: 'project', key: 'project', align: 'right' as const,
      render: (v: number) => `${fmtMoney(v)} ${sym}`,
    },
    {
      title: t('report.savings.saving'), key: 'saving', align: 'right' as const,
      render: (_: unknown, r: { baseline: number; project: number }) => (
        <Text strong style={{ color: '#389e0d' }}>{fmtMoney(r.baseline - r.project)} {sym}</Text>
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
            </div>
            <div>
              <Row gutter={16} style={{ textAlign: 'center', marginBottom: 60 }}>
                <Col span={6}><Statistic title="NPV" value={fmtMoney(fin.npv)} suffix={sym} /></Col>
                <Col span={6}><Statistic title="IRR" value={(fin.irr * 100).toFixed(1)} suffix="%" /></Col>
                <Col span={6}><Statistic title={t('finance.table.paybackStatic')} value={fin.paybackStatic.toFixed(1)} suffix={t('common.years')} /></Col>
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
          </section>

          {/* ③ 运行策略 */}
          <section data-pdf-block style={{ marginTop: 24 }}>
            {secTitle('report.sec.strategy')}
            <ul style={{ lineHeight: 1.9, paddingLeft: 20, marginTop: 0 }}>
              <li>{t('report.strategy.s1')}</li>
              <li>{t('report.strategy.s2')}</li>
              <li>{t('report.strategy.s3', { demand: params.grid.contractDemand_kW })}</li>
              <li>{t('report.strategy.s4', { start: params.grid.outage.windowStart, minutes: params.grid.outage.eventMinutes })}</li>
              <li>{t('report.strategy.s5')}</li>
              <li>{t('report.strategy.s6', { min: `${(params.bess.socMin * 100).toFixed(0)}%`, max: `${(params.bess.socMax * 100).toFixed(0)}%` })}</li>
              <li>{t('report.strategy.s7')}</li>
              <li>{t('report.strategy.s8', { peak: `${params.grid.peakPrice_perkWh} ${sym}`, offpeak: `${params.grid.offPeakPrice_perkWh} ${sym}` })}</li>
            </ul>
            <ReactECharts
              option={buildDispatchOption(t, monthResult, params.grid.contractDemand_kW, MONTHS[repMonth - 1])}
              style={{ height: 340 }}
            />
          </section>

          {/* ④ 节省明细 */}
          <section data-pdf-block style={{ marginTop: 24 }}>
            {secTitle('report.sec.savings')}
            <Table
              size="small"
              pagination={false}
              dataSource={savingsRows}
              columns={savingsColumns}
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
              option={buildMonthlySavingOption(t, sim.monthlyResults, params, MONTHS)}
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
              <Col span={4}><Statistic title="NPV" value={fmtMoney(fin.npv)} /></Col>
              <Col span={4}><Statistic title="IRR" value={`${(fin.irr * 100).toFixed(1)}%`} /></Col>
              <Col span={4}><Statistic title={t('finance.table.paybackStatic')} value={fin.paybackStatic.toFixed(2)} /></Col>
              <Col span={4}><Statistic title={t('finance.table.paybackDynamic')} value={fin.paybackDynamic.toFixed(2)} /></Col>
              <Col span={4}><Statistic title="LCOE" value={fin.lcoe.toFixed(2)} /></Col>
              <Col span={4}><Statistic title="B/C" value={fin.benefitCostRatio.toFixed(2)} /></Col>
            </Row>
            <ReactECharts option={buildCumCashflowOption(t, fin)} style={{ height: 300 }} />
            <Title level={5} style={{ marginTop: 16 }}>{t('report.invest.cashflowTable')}</Title>
            <Table
              size="small"
              pagination={false}
              dataSource={fin.cashflow.map((r) => ({ ...r, key: r.year }))}
              columns={cashflowColumns}
            />
          </section>

          {/* ⑦ 华为储能额外收益（includeHW 时；对比页 Switch 共享同一 store，需求②） */}
          {hw && (
            <section data-pdf-block style={{ marginTop: 24 }}>
              {secTitle('report.sec.hw')}
              {(() => {
                const ind = brands.industry_avg;
                const hwB = brands.HW;
                const pct = (v: number) => (v * 100).toFixed(0);
                const indLoss = (1 - ind.rte) * 100;
                const hwLoss = (1 - hwB.rte) * 100;
                const lossCut = ((indLoss - hwLoss) / indLoss) * 100;
                const annualCharge = sim.monthlyResults.reduce((s, m) => s + m.totals.bessCharge_kWh, 0);
                const extraKwh = annualCharge * (hwB.rte - ind.rte);
                const sohEnd = (arr: number[]) => arr[arr.length - 1] ?? 0;

                const paramRows = [
                  { key: 'rte', metric: `${t('compare.rte')} (RTE)`, industry: `${pct(ind.rte)}%`, hw: `${pct(hwB.rte)}%` },
                  { key: 'rteSplit', metric: `${t('compare.rteSplit')} (√RTE)`, industry: `${(Math.sqrt(ind.rte) * 100).toFixed(1)}%`, hw: `${(Math.sqrt(hwB.rte) * 100).toFixed(1)}%` },
                  { key: 'cost', metric: t('compare.fullPackageCost'), industry: `${fmtMoney(ind.costPerKWh)} ${sym}/kWh`, hw: `${fmtMoney(hwB.costPerKWh)} ${sym}/kWh` },
                  { key: 'opex', metric: `OPEX ${t('common.metric')}`, industry: `${(ind.opexRate * 100).toFixed(1)}%`, hw: `${(hwB.opexRate * 100).toFixed(1)}%` },
                  { key: 'soh', metric: t('report.hw.sohEnd'), industry: `${pct(sohEnd(ind.sohCurve))}%`, hw: `${pct(sohEnd(hwB.sohCurve))}%` },
                ];
                const brandCols = [
                  { title: t('common.metric'), dataIndex: 'metric', key: 'metric' },
                  { title: t('compare.industry'), dataIndex: 'industry', key: 'industry', align: 'right' as const },
                  { title: t('compare.hw'), dataIndex: 'hw', key: 'hw', align: 'right' as const },
                ];
                const finRows = [
                  { key: 'capex', metric: t('finance.table.capex'), industry: fmtMoney(fin.capex), hw: fmtMoney(hw.capex), delta: fmtMoney(hw.capex - fin.capex) },
                  { key: 'rev', metric: t('finance.table.revenue'), industry: fmtMoney(fin.annualRevenue), hw: fmtMoney(hw.annualRevenue), delta: fmtMoney(hw.annualRevenue - fin.annualRevenue) },
                  { key: 'npv', metric: 'NPV', industry: fmtMoney(fin.npv), hw: fmtMoney(hw.npv), delta: fmtMoney(hw.npv - fin.npv) },
                  { key: 'irr', metric: 'IRR', industry: `${(fin.irr * 100).toFixed(1)}%`, hw: `${(hw.irr * 100).toFixed(1)}%`, delta: `${((hw.irr - fin.irr) * 100).toFixed(1)} pp` },
                  { key: 'pbp', metric: t('finance.table.paybackStatic'), industry: fin.paybackStatic.toFixed(2), hw: hw.paybackStatic.toFixed(2), delta: (hw.paybackStatic - fin.paybackStatic).toFixed(2) },
                ];
                const finCols = [
                  { title: t('common.metric'), dataIndex: 'metric', key: 'metric' },
                  { title: t('compare.industry'), dataIndex: 'industry', key: 'industry', align: 'right' as const },
                  { title: t('compare.hw'), dataIndex: 'hw', key: 'hw', align: 'right' as const },
                  { title: 'Δ', dataIndex: 'delta', key: 'delta', align: 'right' as const,
                    render: (v: string) => <Text strong style={{ color: '#722ed1' }}>{v}</Text> },
                ];

                return (
                  <>
                    <Title level={5}>{t('report.hw.paramTitle')}</Title>
                    <Table size="small" pagination={false} dataSource={paramRows} columns={brandCols} style={{ marginBottom: 12 }} />

                    <Title level={5}>{t('report.hw.strategyDiffTitle')}</Title>
                    <ul style={{ lineHeight: 1.9, paddingLeft: 20 }}>
                      <li>{t('report.hw.d1', { hw: pct(hwB.rte), ind: pct(ind.rte), indLoss: indLoss.toFixed(0), hwLoss: hwLoss.toFixed(0) })}</li>
                      <li>{t('report.hw.d2', { hwSoh: pct(sohEnd(hwB.sohCurve)), indSoh: pct(sohEnd(ind.sohCurve)) })}</li>
                      <li>{t('report.hw.d3', { hwOpex: (hwB.opexRate * 100).toFixed(1), indOpex: (ind.opexRate * 100).toFixed(1), hwCost: `${fmtMoney(hwB.costPerKWh)} ${sym}/kWh`, indCost: `${fmtMoney(ind.costPerKWh)} ${sym}/kWh` })}</li>
                    </ul>

                    <Title level={5}>{t('report.hw.savingTitle')}</Title>
                    <Table size="small" pagination={false} dataSource={finRows} columns={finCols} style={{ marginBottom: 12 }} />

                    <Title level={5}>{t('report.hw.energyTitle')}</Title>
                    <Text>{t('report.hw.energyText', { charge: annualCharge.toFixed(0), kwh: extraKwh.toFixed(0), ind: pct(ind.rte), hw: pct(hwB.rte), pct: lossCut.toFixed(0) })}</Text>

                    <div style={{ marginTop: 12 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>{t('excel.hwNote')}</Text>
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
