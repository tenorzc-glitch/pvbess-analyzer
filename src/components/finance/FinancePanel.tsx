import { useEffect, useState } from 'react';
import { Card, Row, Col, Table, Statistic, Spin, Empty, Typography, Button, Space, message, Checkbox } from 'antd';
import { DownloadOutlined, FileExcelOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { useTranslation } from 'react-i18next';
import { useSimulationStore } from '../../store/useSimulationStore';
import { useFinanceStore } from '../../store/useFinanceStore';
import { useParamsStore } from '../../store/useParamsStore';
import { FinanceResult } from '../../types/finance';
import { exportPDF, exportExcelReport } from '../../utils/export';
import { BrandMap, FALLBACK_BRANDS, loadBrandParams, estimateHWFinance } from '../../utils/brand';

const { Title, Text } = Typography;

export default function FinancePanel() {
  const { t } = useTranslation();
  const { results, scenarios, isRunning: simRunning } = useSimulationStore();
  const { results: financeResults, isRunning: finRunning } = useFinanceStore();
  const { params } = useParamsStore();

  // 报告导出选项
  const [reportIncludeGreen, setReportIncludeGreen] = useState(true);
  const [reportIncludeOutage, setReportIncludeOutage] = useState(true);
  const [reportCompareHW, setReportCompareHW] = useState(false);
  const [brands, setBrands] = useState<BrandMap>(FALLBACK_BRANDS);

  useEffect(() => {
    let cancelled = false;
    loadBrandParams().then(({ brands: b }) => { if (!cancelled) setBrands(b); });
    return () => { cancelled = true; };
  }, []);

  const isRunning = simRunning || finRunning;

  if (isRunning) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin size="large" />
        <Text style={{ display: 'block', marginTop: 16 }}>{t('finance.running')}</Text>
      </div>
    );
  }

  if (!financeResults || financeResults.length === 0) {
    return <Empty description={t('finance.noData')} />;
  }

  // 找到最优方案（NPV 最大）
  const bestResult = financeResults.reduce((a, b) => a.npv > b.npv ? a : b);

  // 最优方案对应的仿真结果（用于断电损失/绿电溢价展示）
  const bestSimResult = results?.find(r => r.scenarioId === bestResult.scenarioId) ?? null;
  // 最优方案对应的容量配置（用于 HW 对比估算）
  const bestScenario = scenarios?.find(s => s.id === bestResult.scenarioId) ?? null;
  const hwEstimate = reportCompareHW && bestScenario
    ? estimateHWFinance(params, bestScenario, bestResult, brands)
    : null;

  // ─── NPV 对比柱状图 ───
  const npvChartOption = {
    title: { text: t('finance.npvChart'), left: 'center' },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: financeResults.map(r => `${t('params.scheme')} ${r.scenarioId}`),
    },
    yAxis: { type: 'value', name: t('finance.chart.npv') },
    series: [{
      type: 'bar',
      data: financeResults.map(r => ({
        value: r.npv,
        itemStyle: {
          color: r.scenarioId === bestResult.scenarioId ? '#1677ff' : '#91caff',
        },
      })),
      label: {
        show: true,
        position: 'top',
        formatter: (p: any) => `${(p.value / 1000).toFixed(0)}k`,
      },
    }],
    grid: { left: 60, right: 20, top: 40, bottom: 30 },
  };

  // ─── 累计现金流图 ───
  const cashflowChartOption = {
    title: { text: `${t('params.scheme')} ${bestResult.scenarioId} ${t('finance.cashflowChart')}`, left: 'center' },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: bestResult.cashflow.map(r => `Y${r.year}`),
    },
    yAxis: { type: 'value', name: t('finance.chart.cumulativeCashflow') },
    series: [
      {
        name: t('finance.cashflowChart'),
        type: 'line',
        data: bestResult.cashflow.map(r => r.cumulativeDiscountedCF),
        markLine: {
          data: [{ yAxis: 0, label: { formatter: t('finance.paybackPoint') } }],
          lineStyle: { color: '#ff4d4f', type: 'dashed' },
        },
        areaStyle: { color: 'rgba(22,119,255,0.1)' },
      },
    ],
    grid: { left: 60, right: 20, top: 40, bottom: 30 },
  };

  // ─── 财务对比表 ───
  const financeColumns = [
    { title: t('common.metric'), dataIndex: 'label', key: 'label', width: 160, fixed: 'left' as const },
    ...financeResults.map(r => ({
      title: `${t('params.scheme')} ${r.scenarioId}`,
      dataIndex: `s${r.scenarioId}`,
      key: `s${r.scenarioId}`,
      align: 'right' as const,
    })),
  ];

  const formatMoney = (v: number) => {
    const abs = Math.abs(v);
    if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
    return v.toFixed(0);
  };

  const financeData = [
    {
      label: t('finance.table.capex'),
      ...Object.fromEntries(financeResults.map(r => [`s${r.scenarioId}`, formatMoney(r.capex)])),
    },
    {
      label: t('finance.table.revenue'),
      ...Object.fromEntries(financeResults.map(r => [`s${r.scenarioId}`, formatMoney(r.annualRevenue)])),
    },
    {
      label: t('finance.table.npv'),
      ...Object.fromEntries(financeResults.map(r => [`s${r.scenarioId}`, formatMoney(r.npv)])),
    },
    {
      label: t('finance.table.irr'),
      ...Object.fromEntries(financeResults.map(r => [`s${r.scenarioId}`, `${(r.irr * 100).toFixed(1)}%`])),
    },
    {
      label: t('finance.table.paybackStatic'),
      ...Object.fromEntries(financeResults.map(r => [`s${r.scenarioId}`, r.paybackStatic.toFixed(2)])),
    },
    {
      label: t('finance.table.paybackDynamic'),
      ...Object.fromEntries(financeResults.map(r => [`s${r.scenarioId}`, r.paybackDynamic.toFixed(2)])),
    },
    {
      label: t('finance.table.lcoe'),
      ...Object.fromEntries(financeResults.map(r => [`s${r.scenarioId}`, r.lcoe.toFixed(2)])),
    },
    {
      label: t('finance.table.bcRatio'),
      ...Object.fromEntries(financeResults.map(r => [`s${r.scenarioId}`, r.benefitCostRatio.toFixed(2)])),
    },
  ];

  // ─── 断电损失计算（E8 量纲修复：未供电小时数 × 每小时产值 × 损失率）───
  const monthlyUnserved = bestSimResult?.monthlyResults.map(m => m.totals.unservedHours ?? 0) ?? [];
  const totalUnservedHours = monthlyUnserved.reduce((s, v) => s + v, 0);
  const annualOutageLoss = totalUnservedHours * (params.outageLoss.dailyProductionValue / 24) * params.outageLoss.lossRate;

  const outageChartOption = {
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: monthlyUnserved.map((_, i) => `${i + 1}${t('results.timeScale.month')}`),
    },
    yAxis: { type: 'value', name: 'h' },
    series: [{
      type: 'bar',
      data: monthlyUnserved,
      itemStyle: { color: '#ff4d4f' },
    }],
    grid: { left: 40, right: 10, top: 20, bottom: 20 },
  };

  // ─── 绿电溢价计算 ───
  const annualPV_kWh = bestSimResult?.annual.pv_kWh ?? 0;
  const annualGreen = annualPV_kWh / 1000;
  const annualPremium = annualPV_kWh * params.greenPremium.premiumRate;
  const projectLife = params.financial.projectLife;
  const totalPremium = annualPremium * projectLife;

  const handleDownloadPDF = async () => {
    try {
      message.loading({ content: t('finance.running'), key: 'pdf', duration: 0 });
      await exportPDF('finance-report-content', 'pv-bess-finance-report');
      message.success({ content: 'PDF OK', key: 'pdf' });
    } catch (e: any) {
      message.error({ content: e?.message ?? 'PDF export failed', key: 'pdf' });
    }
  };

  const handleDownloadExcel = async () => {
    try {
      message.loading({ content: t('finance.running'), key: 'excel', duration: 0 });
      await exportExcelReport(
        bestResult,
        `${t('params.scheme')} ${bestResult.scenarioId}`,
        params,
        {
          includeGreen: reportIncludeGreen && params.greenPremium.enabled,
          includeOutage: reportIncludeOutage && params.outageLoss.enabled,
          compareHW: reportCompareHW,
          hwEstimate,
          brands,
        }
      );
      message.success({ content: 'Excel OK', key: 'excel' });
    } catch (e: any) {
      message.error({ content: e?.message ?? 'Excel export failed', key: 'excel' });
    }
  };

  // 报告导出控制条（不进 PDF 截图）
  const reportControls = (
    <Row justify="end" style={{ marginBottom: 8 }}>
      <Space wrap>
        {params.greenPremium.enabled && (
          <Checkbox checked={reportIncludeGreen} onChange={(e) => setReportIncludeGreen(e.target.checked)}>
            {t('report.includeGreen')}
          </Checkbox>
        )}
        {params.outageLoss.enabled && (
          <Checkbox checked={reportIncludeOutage} onChange={(e) => setReportIncludeOutage(e.target.checked)}>
            {t('report.includeOutage')}
          </Checkbox>
        )}
        <Checkbox checked={reportCompareHW} onChange={(e) => setReportCompareHW(e.target.checked)}>
          {t('report.compareWithHW')}
        </Checkbox>
        <Button size="small" icon={<DownloadOutlined />} onClick={handleDownloadPDF}>
          {t('report.downloadPDF')}
        </Button>
        <Button size="small" icon={<FileExcelOutlined />} onClick={handleDownloadExcel}>
          {t('report.downloadExcel')}
        </Button>
      </Space>
    </Row>
  );

  return (
    <>
    {reportControls}
    <div id="finance-report-content">
      {/* 最优方案 KPI */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}>
          <Card size="small">
            <Statistic title={t('finance.recommended')} value={`${t('params.scheme')} ${bestResult.scenarioId}`} />
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small">
            <Statistic title={t('finance.npv')} value={bestResult.npv} precision={0}
              prefix={bestResult.npv >= 0 ? '+' : ''} />
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small">
            <Statistic title={t('finance.irr')} value={(bestResult.irr * 100).toFixed(1)} suffix="%" />
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small">
            <Statistic title={t('finance.payback')} value={bestResult.paybackStatic.toFixed(2)} suffix={t('common.years')} />
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small">
            <Statistic title={t('finance.bcRatio')} value={bestResult.benefitCostRatio.toFixed(2)} />
          </Card>
        </Col>
      </Row>

      {/* NPV 柱状图 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <ReactECharts option={npvChartOption} style={{ height: 300 }} />
      </Card>

      {/* 累计现金流 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <ReactECharts option={cashflowChartOption} style={{ height: 300 }} />
      </Card>

      {/* 断电损失 */}
      {params.outageLoss.enabled && reportIncludeOutage && bestSimResult && (
        <Card size="small" title={t('finance.outage.title')} style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col span={6}>
              <Statistic
                title={t('finance.outage.totalHours')}
                value={totalUnservedHours}
                suffix="h"
                precision={1}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title={t('finance.outage.annualLoss')}
                value={annualOutageLoss}
                prefix="-"
                precision={0}
              />
            </Col>
            <Col span={12}>
              <ReactECharts option={outageChartOption} style={{ height: 120 }} />
            </Col>
          </Row>
        </Card>
      )}

      {/* 绿电溢价 */}
      {params.greenPremium.enabled && reportIncludeGreen && bestSimResult && (
        <Card size="small" title={t('finance.green.title')} style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col span={8}>
              <Statistic
                title={t('finance.green.annualGreen')}
                value={annualGreen}
                suffix="MWh"
                precision={1}
              />
            </Col>
            <Col span={8}>
              <Statistic
                title={t('finance.green.annualPremium')}
                value={annualPremium}
                prefix="+"
                precision={0}
              />
            </Col>
            <Col span={8}>
              <Statistic
                title={t('finance.green.totalPremium')}
                value={totalPremium}
                prefix="+"
                precision={0}
              />
            </Col>
          </Row>
        </Card>
      )}

      {/* HW 品牌对比（报告开关打开且有估算结果时展示，计入 PDF/Excel 报告） */}
      {hwEstimate && (
        <Card size="small" title={`${t('compare.title')} — ${t('compare.industry')} vs ${t('compare.hw')}`} style={{ marginBottom: 16 }}>
          <Table
            dataSource={[
              { key: 'capex', metric: t('finance.table.capex'), industry: bestResult.capex, hw: hwEstimate.capex },
              { key: 'revenue', metric: t('finance.table.revenue'), industry: bestResult.annualRevenue, hw: hwEstimate.annualRevenue },
              { key: 'npv', metric: t('finance.table.npv'), industry: bestResult.npv, hw: hwEstimate.npv },
              { key: 'irr', metric: t('finance.table.irr'), industry: bestResult.irr, hw: hwEstimate.irr, pct: true },
              { key: 'payback', metric: t('finance.table.paybackStatic'), industry: bestResult.paybackStatic, hw: hwEstimate.paybackStatic },
            ]}
            columns={[
              { title: t('common.metric'), dataIndex: 'metric', key: 'metric', width: 160 },
              { title: t('compare.industry'), dataIndex: 'industry', key: 'industry', align: 'right' as const,
                render: (v: number, r: any) => r.pct ? `${(v * 100).toFixed(1)}%` : formatMoney(v) },
              { title: t('compare.hw'), dataIndex: 'hw', key: 'hw', align: 'right' as const,
                render: (v: number, r: any) => r.pct ? `${(v * 100).toFixed(1)}%` : formatMoney(v) },
              { title: 'Δ', key: 'delta', align: 'right' as const,
                render: (_: any, r: any) => {
                  const d = r.hw - r.industry;
                  return r.pct ? `${(d * 100).toFixed(2)}pp` : `${d >= 0 ? '+' : ''}${formatMoney(d)}`;
                } },
            ]}
            pagination={false}
            size="small"
          />
        </Card>
      )}

      {/* 财务指标汇总表 */}
      <Card
        size="small"
        title={t('finance.title')}
      >
        <Table
          dataSource={financeData.map((d, i) => ({ ...d, key: i }))}
          columns={financeColumns}
          pagination={false}
          size="small"
          scroll={{ x: 800 }}
        />
      </Card>
    </div>
    </>
  );
}
