import { useEffect, useState, useMemo } from 'react';
import { Card, Table, Switch, Typography, Row, Col, Statistic, Space, Tag } from 'antd';
import { useTranslation } from 'react-i18next';
import { useParamsStore } from '../../store/useParamsStore';
import { useSimulationStore } from '../../store/useSimulationStore';
import { useFinanceStore } from '../../store/useFinanceStore';
import { useReportStore } from '../../store/useReportStore';
import {
  BrandParams, BrandMap, FALLBACK_BRANDS, loadBrandParams,
  computeBrandCapex, estimateHWFinance, computeThroughput10Kwh,
} from '../../utils/brand';

export default function ComparePanel() {
  const { t } = useTranslation();
  const { params } = useParamsStore();
  const { scenarios, results: simResults } = useSimulationStore();
  const { results: financeResults } = useFinanceStore();

  const [brands, setBrands] = useState<BrandMap>(FALLBACK_BRANDS);
  // includeHW 共享给报告页：打开华为对比 → 报告自动含华为章（需求②）
  const includeHW = useReportStore((s) => s.includeHW);
  const setIncludeHW = useReportStore((s) => s.setIncludeHW);
  const [dataSource, setDataSource] = useState<'supabase' | 'fallback'>('fallback');

  // 从 Supabase 读取品牌参数；失败则使用内置默认值
  useEffect(() => {
    let cancelled = false;
    loadBrandParams().then(({ brands: b, source }) => {
      if (!cancelled) {
        setBrands(b);
        setDataSource(source);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 当前项目所选方案（用于 CAPEX 估算）
  const currentScenario = useMemo(() => {
    const sel = params.selectedScheme;
    return scenarios.find((s) => s.id === sel) ?? scenarios[0] ?? null;
  }, [params.selectedScheme, scenarios]);

  // 基于品牌参数 + 当前方案容量计算 CAPEX（简化估算）
  const computeCAPEX = (brand: BrandParams): number => {
    if (!currentScenario) return 0;
    return computeBrandCapex(params, currentScenario, brand);
  };

  // 行业平均方案的财务结果（取与 selectedScheme 对应或最优）
  const industryFinance = useMemo(() => {
    if (!financeResults || financeResults.length === 0) return null;
    return (
      financeResults.find((r) => r.scenarioId === params.selectedScheme) ??
      financeResults.reduce((a, b) => (a.npv > b.npv ? a : b))
    );
  }, [financeResults, params.selectedScheme]);

  // 行业方案的仿真结果（10 年吞吐口径用）
  const industrySim = useMemo(() => {
    if (!simResults || !industryFinance) return null;
    return simResults.find((r) => r.scenarioId === industryFinance.scenarioId) ?? null;
  }, [simResults, industryFinance]);

  // HW 方案粗略估算（基于品牌差异做简化调整）
  const hwEstimate = useMemo(() => {
    if (!currentScenario || !industryFinance) return null;
    return estimateHWFinance(params, currentScenario, industryFinance, brands, industrySim);
  }, [brands, currentScenario, industryFinance, industrySim, params]);

  // 行业侧 10 年 NPV（与报告口径一致）
  const industryNpv10 = useMemo(() => {
    if (!industryFinance) return 0;
    return industryFinance.cashflow
      .filter((r) => r.year <= 10)
      .reduce((s, r) => s + r.discountedCashflow, 0);
  }, [industryFinance]);

  // ─── 对比表数据 ───
  const tableColumns = [
    { title: t('common.metric'), dataIndex: 'metric', key: 'metric', width: 180 },
    { title: t('compare.industry'), dataIndex: 'industry', key: 'industry' },
    { title: t('compare.hw'), dataIndex: 'hw', key: 'hw' },
  ];

  const formatPct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const formatMoney = (v: number) => {
    const abs = Math.abs(v);
    if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
    return v.toFixed(0);
  };

  const tableData = [
    {
      key: 'rte',
      metric: `${t('compare.rte')} (RTE)`,
      industry: formatPct(brands.industry_avg.rte),
      hw: formatPct(brands.HW.rte),
    },
    {
      key: 'rteSplit',
      metric: `${t('compare.rteSplit')} (√RTE)`,
      industry: formatPct(Math.sqrt(brands.industry_avg.rte)),
      hw: formatPct(Math.sqrt(brands.HW.rte)),
    },
    {
      key: 'costPerKWh',
      metric: `${t('compare.fullPackageCost')} (costPerKWh)`,
      industry: formatMoney(brands.industry_avg.costPerKWh),
      hw: formatMoney(brands.HW.costPerKWh),
    },
    {
      key: 'opexRate',
      metric: `OPEX ${t('common.metric')} (opexRate)`,
      industry: formatPct(brands.industry_avg.opexRate),
      hw: formatPct(brands.HW.opexRate),
    },
    {
      key: 'dod',
      metric: `${t('compare.dod')} (DOD)`,
      industry: formatPct(brands.industry_avg.dod),
      hw: formatPct(brands.HW.dod),
    },
    {
      key: 'operatingDays',
      metric: t('compare.operatingDays'),
      industry: `${brands.industry_avg.operatingDaysPerYear}`,
      hw: `${brands.HW.operatingDaysPerYear}`,
    },
    {
      key: 'sohY10',
      metric: t('compare.sohY10'),
      industry: formatPct(brands.industry_avg.sohCurve[9] ?? 0),
      hw: formatPct(brands.HW.sohCurve[9] ?? 0),
    },
    {
      key: 'sohCurve',
      metric: `${t('compare.soh')} (sohCurve, 15Y)`,
      industry: brands.industry_avg.sohCurve.map((v) => v.toFixed(3)).join(' / '),
      hw: brands.HW.sohCurve.map((v) => v.toFixed(3)).join(' / '),
    },
  ];

  // ─── 财务对比表 ───
  const financeCompareColumns = [
    { title: t('common.metric'), dataIndex: 'metric', key: 'metric', width: 160 },
    { title: t('compare.industry'), dataIndex: 'industry', key: 'industry', align: 'right' as const },
    { title: t('compare.hw'), dataIndex: 'hw', key: 'hw', align: 'right' as const },
    { title: 'Δ (HW − Industry)', dataIndex: 'delta', key: 'delta', align: 'right' as const },
  ];

  const financeCompareData = useMemo(() => {
    if (!industryFinance || !hwEstimate) return [];
    const rows: Array<{ key: string; metric: string; industry: string; hw: string; delta: string }> = [];
    const pushRow = (key: string, metric: string, ind: number, hw: number, fmt: (v: number) => string, fmtDelta?: (v: number) => string) => {
      rows.push({
        key,
        metric,
        industry: fmt(ind),
        hw: fmt(hw),
        delta: (fmtDelta ?? fmt)(hw - ind),
      });
    };
    // 行业侧 10 年口径：从现金流表取前 10 年
    const cf10 = industryFinance.cashflow.filter((r) => r.year <= 10);
    const revenue10Ind = cf10.reduce((s, r) => s + r.totalRevenue, 0);
    const npv10Ind = cf10.reduce((s, r) => s + r.discountedCashflow, 0);
    const opexInd1 = industryFinance.cashflow.find((r) => r.year === 1)?.opex ?? 0;
    // 行业 10 年吞吐（主引擎 SOH 曲线）
    const annualDischargeInd = industrySim
      ? industrySim.monthlyResults.reduce((s, m) => s + (m.totals.bessDischarge_kWh || 0), 0)
      : 0;
    const throughput10Ind = computeThroughput10Kwh(annualDischargeInd, params.sohCurve);

    pushRow('capex', t('finance.table.capex'), industryFinance.capex, hwEstimate.capex, formatMoney);
    pushRow('opex', t('compare.opexYear1'), opexInd1, hwEstimate.opexYear1, formatMoney);
    pushRow('revenue10', t('compare.revenue10'), revenue10Ind, hwEstimate.revenue10, formatMoney);
    pushRow('npv10', t('compare.npv10'), npv10Ind, hwEstimate.npv10, formatMoney);
    pushRow('payback', t('finance.table.paybackStatic'), industryFinance.paybackStatic, hwEstimate.paybackStatic, (v) => `${v.toFixed(2)} ${t('common.years')}`);
    pushRow('throughput', t('compare.throughput10'), throughput10Ind, hwEstimate.throughput10,
      (v) => `${(v / 1000).toFixed(0)} MWh`, (v) => `${(v / 1000).toFixed(1)} MWh`);
    return rows;
  }, [industryFinance, hwEstimate, industrySim, params.sohCurve, t]);

  return (
    <div>
      <Card
        size="small"
        title={
          <Space>
            <span>{t('compare.title')}</span>
            <Tag color={dataSource === 'supabase' ? 'green' : 'orange'}>
              {dataSource === 'supabase' ? 'Supabase' : t('sync.offline').slice(0, 12)}
            </Tag>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <Typography.Text type="secondary">{t('compare.sameCapacity')}</Typography.Text>
        <Table
          dataSource={tableData}
          columns={tableColumns}
          pagination={false}
          size="small"
          style={{ marginTop: 12 }}
        />
      </Card>

      <Card
        size="small"
        title={
          <Space>
            <span>{t('compare.hw')}</span>
            <Switch checked={includeHW} onChange={setIncludeHW} />
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        {!includeHW ? (
          <Typography.Text type="secondary">
            {t('compare.hw')} —
          </Typography.Text>
        ) : !currentScenario ? (
          <Typography.Text type="warning">{t('compare.noScenario')}</Typography.Text>
        ) : !industryFinance ? (
          <Typography.Text type="warning">{t('finance.noData')}</Typography.Text>
        ) : (
          <>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={6}>
                <Statistic
                  title={`${t('finance.table.capex')} Δ`}
                  value={hwEstimate!.capex - industryFinance.capex}
                  precision={0}
                  prefix={hwEstimate!.capex - industryFinance.capex >= 0 ? '+' : ''}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title={`${t('compare.npv10')} Δ`}
                  value={hwEstimate!.npv10 - industryNpv10}
                  precision={0}
                  prefix={hwEstimate!.npv10 - industryNpv10 >= 0 ? '+' : ''}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title={`${t('finance.table.irr')} Δ`}
                  value={((hwEstimate!.irr - industryFinance.irr) * 100).toFixed(2)}
                  suffix="%"
                  prefix={hwEstimate!.irr - industryFinance.irr >= 0 ? '+' : ''}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title={`${t('finance.payback')} Δ`}
                  value={(hwEstimate!.paybackStatic - industryFinance.paybackStatic).toFixed(2)}
                  suffix={t('common.years')}
                  prefix={hwEstimate!.paybackStatic - industryFinance.paybackStatic >= 0 ? '+' : ''}
                />
              </Col>
            </Row>
            <Table
              dataSource={financeCompareData}
              columns={financeCompareColumns}
              pagination={false}
              size="small"
            />
          </>
        )}
      </Card>
    </div>
  );
}
