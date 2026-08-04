import { useEffect, useState, useMemo } from 'react';
import { Card, Table, Switch, Typography, Row, Col, Statistic, Space, Tag } from 'antd';
import { useTranslation } from 'react-i18next';
import { useParamsStore } from '../../store/useParamsStore';
import { useSimulationStore } from '../../store/useSimulationStore';
import { useFinanceStore } from '../../store/useFinanceStore';
import {
  BrandParams, BrandMap, FALLBACK_BRANDS, loadBrandParams,
  computeBrandCapex, estimateHWFinance,
} from '../../utils/brand';

export default function ComparePanel() {
  const { t } = useTranslation();
  const { params } = useParamsStore();
  const { scenarios } = useSimulationStore();
  const { results: financeResults } = useFinanceStore();

  const [brands, setBrands] = useState<BrandMap>(FALLBACK_BRANDS);
  const [includeHW, setIncludeHW] = useState(false);
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

  // HW 方案粗略估算（基于品牌差异做简化调整）
  const hwEstimate = useMemo(() => {
    if (!currentScenario || !industryFinance) return null;
    return estimateHWFinance(params, currentScenario, industryFinance, brands);
  }, [brands, currentScenario, industryFinance, params]);

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
    pushRow('capex', t('finance.table.capex'), industryFinance.capex, hwEstimate.capex, formatMoney);
    pushRow('revenue', t('finance.table.revenue'), industryFinance.annualRevenue, hwEstimate.annualRevenue, formatMoney);
    pushRow('npv', t('finance.table.npv'), industryFinance.npv, hwEstimate.npv, formatMoney);
    pushRow('irr', t('finance.table.irr'), industryFinance.irr, hwEstimate.irr, (v) => `${(v * 100).toFixed(1)}%`);
    pushRow('payback', t('finance.table.paybackStatic'), industryFinance.paybackStatic, hwEstimate.paybackStatic, (v) => `${v.toFixed(2)} ${t('common.years')}`);
    return rows;
  }, [industryFinance, hwEstimate]);

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
                  title={`${t('finance.table.npv')} Δ`}
                  value={hwEstimate!.npv - industryFinance.npv}
                  precision={0}
                  prefix={hwEstimate!.npv - industryFinance.npv >= 0 ? '+' : ''}
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
