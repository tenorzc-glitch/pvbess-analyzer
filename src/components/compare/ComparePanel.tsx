import { useEffect, useState, useMemo } from 'react';
import { Card, Table, Switch, Typography, Row, Col, Statistic, Space, Tag } from 'antd';
import { useTranslation } from 'react-i18next';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { useParamsStore } from '../../store/useParamsStore';
import { useSimulationStore } from '../../store/useSimulationStore';
import { useFinanceStore } from '../../store/useFinanceStore';

/** 品牌参数结构 */
interface BrandParams {
  efficiencyCharge: number;
  efficiencyDischarge: number;
  sohCurve: number[];
  costPerKWh: number;
  pcsCostPerKW: number;
  opexRate: number;
}

/** 内置默认品牌参数（离线降级） */
const FALLBACK_BRANDS: Record<'industry_avg' | 'HW', BrandParams> = {
  industry_avg: {
    efficiencyCharge: 0.96,
    efficiencyDischarge: 0.96,
    sohCurve: [1, 0.975, 0.95, 0.925, 0.9, 0.875, 0.85, 0.825, 0.8, 0.775],
    costPerKWh: 1350,
    pcsCostPerKW: 650,
    opexRate: 0.015,
  },
  HW: {
    efficiencyCharge: 0.975,
    efficiencyDischarge: 0.975,
    sohCurve: [1, 0.98, 0.96, 0.94, 0.92, 0.9, 0.88, 0.86, 0.84, 0.82],
    costPerKWh: 1500,
    pcsCostPerKW: 750,
    opexRate: 0.012,
  },
};

/** 把数据库行 / 任意松散对象规整成 BrandParams */
function normalizeBrand(row: any, fallback: BrandParams): BrandParams {
  if (!row || typeof row !== 'object') return fallback;
  const sohRaw = Array.isArray(row.sohCurve) ? row.sohCurve : fallback.sohCurve;
  const sohCurve = sohRaw.map((v: any) => Number(v)).filter((v: number) => !Number.isNaN(v));
  return {
    efficiencyCharge: Number(row.efficiencyCharge ?? fallback.efficiencyCharge),
    efficiencyDischarge: Number(row.efficiencyDischarge ?? fallback.efficiencyDischarge),
    sohCurve: sohCurve.length > 0 ? sohCurve : fallback.sohCurve,
    costPerKWh: Number(row.costPerKWh ?? fallback.costPerKWh),
    pcsCostPerKW: Number(row.pcsCostPerKW ?? fallback.pcsCostPerKW),
    opexRate: Number(row.opexRate ?? fallback.opexRate),
  };
}

export default function ComparePanel() {
  const { t } = useTranslation();
  const { params } = useParamsStore();
  const { scenarios } = useSimulationStore();
  const { results: financeResults } = useFinanceStore();

  const [brands, setBrands] = useState<Record<'industry_avg' | 'HW', BrandParams>>(FALLBACK_BRANDS);
  const [includeHW, setIncludeHW] = useState(false);
  const [dataSource, setDataSource] = useState<'supabase' | 'fallback'>('fallback');

  // 从 Supabase 读取品牌参数；失败则使用内置默认值
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!isSupabaseConfigured() || !supabase) {
        setBrands(FALLBACK_BRANDS);
        setDataSource('fallback');
        return;
      }
      try {
        const { data, error } = await supabase.from('brand_params').select('*');
        if (error || !data) throw error;
        const map = { ...FALLBACK_BRANDS } as Record<'industry_avg' | 'HW', BrandParams>;
        for (const row of data) {
          const key = row?.brand ?? row?.key ?? row?.id;
          if (key === 'industry_avg') map.industry_avg = normalizeBrand(row, FALLBACK_BRANDS.industry_avg);
          else if (key === 'HW') map.HW = normalizeBrand(row, FALLBACK_BRANDS.HW);
        }
        if (!cancelled) {
          setBrands(map);
          setDataSource('supabase');
        }
      } catch {
        if (!cancelled) {
          setBrands(FALLBACK_BRANDS);
          setDataSource('fallback');
        }
      }
    }
    load();
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
    const pvCost = params.pv.capacity_kWp * params.capex.pvCost_perkW + params.capex.pvFixedCost;
    const bessCost = currentScenario.bessCapacity_kWh * brand.costPerKWh;
    const pcsCost = currentScenario.pcsPower_kW * brand.pcsCostPerKW;
    const installation = (bessCost + pcsCost) * params.capex.installationPct;
    return pvCost + bessCost + pcsCost + installation + params.capex.bessFixedCost + params.capex.remoteTransport;
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
    const capexHW = computeCAPEX(brands.HW);
    const capexBase = computeCAPEX(brands.industry_avg);
    const capexDelta = capexHW - capexBase;

    // 效率提升带来的年收益增益（充放电效率乘积提升比例 × 基准年收益）
    const effBase = brands.industry_avg.efficiencyCharge * brands.industry_avg.efficiencyDischarge;
    const effHW = brands.HW.efficiencyCharge * brands.HW.efficiencyDischarge;
    const effGain = effHW - effBase;
    const annualRevenueHW = industryFinance.annualRevenue * (1 + effGain);

    // OPEX 比率差异（按 CAPEX 比率计提）
    const opexDelta = capexHW * brands.HW.opexRate - capexBase * brands.industry_avg.opexRate;
    const annualNetHW = annualRevenueHW - opexDelta;

    // 简化 NPV：在基准 NPV 上叠加 CAPEX 差与年净收益差的现值
    const life = params.financial.projectLife;
    const r = params.financial.discountRate;
    const annuityFactor = (1 - Math.pow(1 + r, -life)) / r;
    const npvHW = industryFinance.npv - capexDelta + (annualNetHW - industryFinance.annualRevenue) * annuityFactor;

    // IRR 简化：基于 NPV 偏移做小幅调整
    const irrHW = industryFinance.irr + (npvHW - industryFinance.npv) / Math.max(capexHW, 1) * 0.5;

    // 回收期简化：CAPEX / 首年净收益
    const paybackHW = capexHW / Math.max(annualNetHW, 1);

    return {
      capex: capexHW,
      annualRevenue: annualRevenueHW,
      npv: npvHW,
      irr: Math.max(-1, Math.min(1, irrHW)),
      paybackStatic: paybackHW,
    };
  }, [brands, currentScenario, industryFinance, params.financial]);

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
      key: 'effCharge',
      metric: `${t('params.chargeEfficiency')} (efficiencyCharge)`,
      industry: formatPct(brands.industry_avg.efficiencyCharge),
      hw: formatPct(brands.HW.efficiencyCharge),
    },
    {
      key: 'effDischarge',
      metric: `${t('params.dischargeEfficiency')} (efficiencyDischarge)`,
      industry: formatPct(brands.industry_avg.efficiencyDischarge),
      hw: formatPct(brands.HW.efficiencyDischarge),
    },
    {
      key: 'costPerKWh',
      metric: `${t('params.bessUnitCost')} (costPerKWh)`,
      industry: formatMoney(brands.industry_avg.costPerKWh),
      hw: formatMoney(brands.HW.costPerKWh),
    },
    {
      key: 'pcsCostPerKW',
      metric: `${t('params.pcsUnitCost')} (pcsCostPerKW)`,
      industry: formatMoney(brands.industry_avg.pcsCostPerKW),
      hw: formatMoney(brands.HW.pcsCostPerKW),
    },
    {
      key: 'opexRate',
      metric: `OPEX ${t('common.metric')} (opexRate)`,
      industry: formatPct(brands.industry_avg.opexRate),
      hw: formatPct(brands.HW.opexRate),
    },
    {
      key: 'sohCurve',
      metric: `${t('compare.soh')} (sohCurve, 10Y)`,
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
    pushRow('payback', t('finance.table.paybackStatic'), industryFinance.paybackStatic, hwEstimate.paybackStatic, (v) => `${v.toFixed(2)} 年`);
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
          <Typography.Text type="warning">未选择方案，无法计算 CAPEX 对比</Typography.Text>
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
                  suffix="年"
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
