/** 多品牌对比面板（模块C）：
 * - 品牌管理卡：动态增删 Brand X/Y/Z（默认复制行业基准参数），行业基准不可删
 * - 参数对比表：每品牌一列（可编辑），18 项参数
 * - 财务对比：行业基准 vs 勾选品牌（多选），复用 estimateBrandFinance
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Card, Table, Typography, Row, Col, Statistic, Space, Tag, Button, Input,
  InputNumber, Switch, Checkbox, Popconfirm, message,
} from 'antd';
import { PlusOutlined, DeleteOutlined, DownloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useParamsStore } from '../../store/useParamsStore';
import { useSimulationStore } from '../../store/useSimulationStore';
import { useFinanceStore } from '../../store/useFinanceStore';
import { useReportStore } from '../../store/useReportStore';
import { useBrandStore, BrandConfig } from '../../store/useBrandStore';
import {
  BrandMap, FALLBACK_BRANDS, loadBrandParams,
  estimateBrandFinance, estimateBrandFinanceAnchored, computeThroughput10Kwh,
} from '../../utils/brand';
import { downloadBrandExcel } from '../../utils/excel';

const { Text } = Typography;

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const fmtM = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return v.toFixed(0);
};

export default function ComparePanel() {
  const { t } = useTranslation();
  const { params } = useParamsStore();
  const { scenarios, results: simResults } = useSimulationStore();
  const { results: financeResults } = useFinanceStore();
  const setIncludeHW = useReportStore((s) => s.setIncludeHW);

  const { brands, activeCompareIds, addBrand, removeBrand, renameBrand, updateBrandParams, setActiveCompareIds, setBrands } =
    useBrandStore();
  const [dataSource, setDataSource] = useState<'supabase' | 'fallback'>('fallback');

  // 从 Supabase 读取品牌参数（仅 industry_avg / HW 两行）；其余品牌保留本地
  useEffect(() => {
    let cancelled = false;
    loadBrandParams().then(({ brands: b, source }) => {
      if (cancelled) return;
      setDataSource(source);
      if (source === 'supabase') {
        // 用 Supabase 数据覆盖行业基准和 HW
        useBrandStore.setState((s) => ({
          brands: s.brands.map((bc) => {
            if (bc.id === 'industry_avg') return { ...bc, params: b.industry_avg };
            if (bc.id === 'HW') return { ...bc, params: b.HW };
            return bc;
          }),
        }));
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentScenario = useMemo(() => {
    const sel = params.selectedScheme;
    return scenarios.find((s) => s.id === sel) ?? scenarios[0] ?? null;
  }, [params.selectedScheme, scenarios]);

  const industryFinance = useMemo(() => {
    if (!financeResults || financeResults.length === 0) return null;
    return (
      financeResults.find((r) => r.scenarioId === params.selectedScheme) ??
      financeResults.reduce((a, b) => (a.npv > b.npv ? a : b))
    );
  }, [financeResults, params.selectedScheme]);

  const industrySim = useMemo(() => {
    if (!simResults || !industryFinance) return null;
    return simResults.find((r) => r.scenarioId === industryFinance.scenarioId) ?? null;
  }, [simResults, industryFinance]);

  const baseline = brands.find((b) => b.isBaseline) ?? brands[0];

  // 引擎口径行业指标（锚定基准）
  const engineMetrics = useMemo(() => {
    if (!industryFinance) return null;
    const cf10 = industryFinance.cashflow.filter((r) => r.year <= 10);
    const annualDischargeInd = industrySim
      ? industrySim.monthlyResults.reduce((s, m) => s + (m.totals.bessDischarge_kWh || 0), 0)
      : 0;
    return {
      npv10: cf10.reduce((s, r) => s + r.discountedCashflow, 0),
      revenue10: cf10.reduce((s, r) => s + r.totalRevenue, 0),
      opexYear1: industryFinance.cashflow.find((r) => r.year === 1)?.opex ?? 0,
      throughput10: computeThroughput10Kwh(annualDischargeInd, params.sohCurve),
    };
  }, [industryFinance, industrySim, params.sohCurve]);

  // 每品牌的财务估算（锚定引擎口径：品牌=行业基线时严格 Δ=0）
  const brandEstimates = useMemo(() => {
    if (!currentScenario || !industryFinance || !baseline || !engineMetrics) return new Map<string, ReturnType<typeof estimateBrandFinanceAnchored>>();
    const map = new Map<string, ReturnType<typeof estimateBrandFinanceAnchored>>();
    for (const bc of brands) {
      if (bc.isBaseline || !activeCompareIds.includes(bc.id)) continue;
      map.set(bc.id, estimateBrandFinanceAnchored(
        params, currentScenario, industryFinance, baseline.params, bc.params, industrySim, engineMetrics,
      ));
    }
    return map;
  }, [brands, activeCompareIds, currentScenario, industryFinance, industrySim, params, baseline, engineMetrics]);

  // 行业侧 10 年 NPV
  const industryNpv10 = useMemo(() => {
    if (!industryFinance) return 0;
    return industryFinance.cashflow.filter((r) => r.year <= 10).reduce((s, r) => s + r.discountedCashflow, 0);
  }, [industryFinance]);

  // ── 参数对比表 ──
  interface ParamRowDef {
    key: string;
    label: string;
    get: (p: BrandConfig['params']) => string | number;
    edit?: 'number' | 'percent' | 'bool';
    set?: (p: BrandConfig['params'], v: any) => Partial<BrandConfig['params']>;
  }
  const paramRows: ParamRowDef[] = [
    { key: 'rte', label: `${t('compare.rte')} (RTE)`, get: (p) => pct(p.rte), edit: 'percent', set: (_p, v) => ({ rte: v }) },
    { key: 'dod', label: t('compare.dod'), get: (p) => pct(p.dod), edit: 'percent', set: (_p, v) => ({ dod: v }) },
    { key: 'socMinOffgrid', label: t('excel.rows.socMinOffgrid'), get: (p) => pct(p.socMinOffgrid), edit: 'percent', set: (_p, v) => ({ socMinOffgrid: v }) },
    { key: 'socMaxOffgrid', label: t('excel.rows.socMaxOffgrid'), get: (p) => pct(p.socMaxOffgrid), edit: 'percent', set: (_p, v) => ({ socMaxOffgrid: v }) },
    { key: 'days', label: t('compare.operatingDays'), get: (p) => p.operatingDaysPerYear, edit: 'number', set: (_p, v) => ({ operatingDaysPerYear: v }) },
    { key: 'sohY10', label: t('compare.sohY10'), get: (p) => pct(p.sohCurve[9] ?? 0) },
    { key: 'cost', label: t('compare.fullPackageCost'), get: (p) => `${fmtM(p.costPerKWh)}`, edit: 'number', set: (_p, v) => ({ costPerKWh: v }) },
    { key: 'opexRate', label: `OPEX ${t('common.metric')}`, get: (p) => pct(p.opexRate), edit: 'percent', set: (_p, v) => ({ opexRate: v }) },
    { key: 'transformer', label: t('excel.rows.needsIsolationTransformer'), get: (p) => (p.needsIsolationTransformer ? '✓' : '—'), edit: 'bool', set: (_p, v) => ({ needsIsolationTransformer: v }) },
    { key: 'transformerLoss', label: t('excel.rows.transformerEfficiencyLoss'), get: (p) => pct(p.transformerEfficiencyLoss), edit: 'percent', set: (_p, v) => ({ transformerEfficiencyLoss: v }) },
    { key: 'balancing', label: t('excel.rows.needsManualBalancing'), get: (p) => (p.needsManualBalancing ? '✓' : '—'), edit: 'bool', set: (_p, v) => ({ needsManualBalancing: v }) },
    { key: 'coolant', label: t('excel.rows.needsCoolantReplacement'), get: (p) => (p.needsCoolantReplacement ? '✓' : '—'), edit: 'bool', set: (_p, v) => ({ needsCoolantReplacement: v }) },
    { key: 'coolantInterval', label: t('excel.rows.coolantIntervalYears'), get: (p) => p.coolantIntervalYears, edit: 'number', set: (_p, v) => ({ coolantIntervalYears: v }) },
    { key: 'autoCalib', label: t('excel.rows.autoCalibration'), get: (p) => (p.autoCalibration ? '✓' : '—'), edit: 'bool', set: (_p, v) => ({ autoCalibration: v }) },
  ];

  const paramColumns = [
    { title: t('common.metric'), dataIndex: 'label', key: 'label', width: 180, fixed: 'left' as const },
    ...brands.map((bc) => ({
      title: (
        <Space size={4}>
          {bc.isBaseline ? (
            <span>{bc.label}</span>
          ) : (
            <Input
              size="small"
              value={bc.label}
              style={{ width: 90 }}
              onChange={(e) => renameBrand(bc.id, e.target.value)}
            />
          )}
          {bc.isBaseline && <Tag color="blue" style={{ fontSize: 10 }}>base</Tag>}
        </Space>
      ),
      key: bc.id,
      align: 'right' as const,
      render: (_: unknown, row: ParamRowDef) => {
        const val = row.get(bc.params);
        if (!row.edit || bc.isBaseline) return <span>{val}</span>;
        if (row.edit === 'bool') {
          return (
            <Switch
              size="small"
              checked={val === '✓'}
              onChange={(v) => updateBrandParams(bc.id, row.set!(bc.params, v))}
            />
          );
        }
        const numVal = row.edit === 'percent' ? Number(String(val).replace('%', '')) : Number(val);
        return (
          <InputNumber
            size="small"
            style={{ width: 80 }}
            value={numVal}
            step={row.edit === 'percent' ? 1 : undefined}
            onChange={(v) => {
              if (v == null) return;
              const raw = row.edit === 'percent' ? v / 100 : v;
              updateBrandParams(bc.id, row.set!(bc.params, raw));
            }}
          />
        );
      },
    })),
    // 操作列
    {
      title: '',
      key: '_ops',
      width: 60,
      render: (_: unknown, __: unknown, idx: number) =>
        idx === 0 ? (
          <Button size="small" type="text" icon={<PlusOutlined />} onClick={() => addBrand()} />
        ) : null,
    },
  ];

  // ── 财务对比表 ──
  const activeBrands = brands.filter((b) => !b.isBaseline && activeCompareIds.includes(b.id));
  const finColumns = [
    { title: t('common.metric'), dataIndex: 'metric', key: 'metric', width: 160 },
    { title: baseline?.label ?? 'Industry', dataIndex: 'industry', key: 'industry', align: 'right' as const },
    ...activeBrands.map((bc) => ({
      title: bc.label,
      dataIndex: `b_${bc.id}`,
      key: bc.id,
      align: 'right' as const,
    })),
  ];

  const finRows = useMemo(() => {
    if (!industryFinance || activeBrands.length === 0) return [];
    const cf10 = industryFinance.cashflow.filter((r) => r.year <= 10);
    const revenue10Ind = cf10.reduce((s, r) => s + r.totalRevenue, 0);
    const opexInd1 = industryFinance.cashflow.find((r) => r.year === 1)?.opex ?? 0;
    const annualDischargeInd = industrySim
      ? industrySim.monthlyResults.reduce((s, m) => s + (m.totals.bessDischarge_kWh || 0), 0)
      : 0;
    const throughput10Ind = computeThroughput10Kwh(annualDischargeInd, params.sohCurve);

    const metrics: Array<{ key: string; label: string; ind: string; get: (est: any) => string }> = [
      { key: 'capex', label: t('finance.table.capex'), ind: fmtM(industryFinance.capex), get: (e) => fmtM(e.capex) },
      { key: 'opex', label: t('compare.opexYear1'), ind: fmtM(opexInd1), get: (e) => fmtM(e.opexYear1) },
      { key: 'rev10', label: t('compare.revenue10'), ind: fmtM(revenue10Ind), get: (e) => fmtM(e.revenue10) },
      { key: 'npv10', label: t('compare.npv10'), ind: fmtM(industryNpv10), get: (e) => fmtM(e.npv10) },
      { key: 'pbp', label: t('finance.table.paybackStatic'), ind: industryFinance.paybackStatic.toFixed(2), get: (e) => e.paybackStatic.toFixed(2) },
      { key: 'thr', label: t('compare.throughput10'), ind: `${(throughput10Ind / 1000).toFixed(0)} MWh`, get: (e) => `${(e.throughput10 / 1000).toFixed(0)} MWh` },
    ];
    return metrics.map((m) => {
      const row: any = { key: m.key, metric: m.label, industry: m.ind };
      for (const bc of activeBrands) {
        const est = brandEstimates.get(bc.id);
        row[`b_${bc.id}`] = est ? m.get(est) : '—';
      }
      return row;
    });
  }, [industryFinance, activeBrands, brandEstimates, industrySim, params.sohCurve, industryNpv10, t]);

  // 报告联动：任一品牌勾选 → 报告含 HW 章（沿用 includeHW 通道）
  useEffect(() => {
    setIncludeHW(activeCompareIds.length > 0);
  }, [activeCompareIds, setIncludeHW]);

  const handleExportBrands = () => {
    downloadBrandExcel(brands.map((b) => ({ id: b.id, label: b.label, params: b.params })))
      .then(() => message.success('OK'))
      .catch((e) => message.error(String(e)));
  };

  return (
    <div>
      {/* 品牌管理卡 */}
      <Card
        size="small"
        title={
          <Space>
            <span>{t('compare.brandManagement')}</span>
            <Tag color={dataSource === 'supabase' ? 'green' : 'orange'}>
              {dataSource === 'supabase' ? 'Supabase' : t('sync.offline').slice(0, 12)}
            </Tag>
          </Space>
        }
        extra={
          <Space>
            <Button size="small" icon={<DownloadOutlined />} onClick={handleExportBrands}>
              {t('compare.exportExcel')}
            </Button>
            <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => addBrand()}>
              {t('compare.addBrand')}
            </Button>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <Space wrap size={12}>
          {brands.map((bc) => (
            <Tag
              key={bc.id}
              color={bc.isBaseline ? 'blue' : activeCompareIds.includes(bc.id) ? 'green' : 'default'}
              style={{ padding: '4px 10px', fontSize: 13 }}
            >
              <Checkbox
                checked={bc.isBaseline || activeCompareIds.includes(bc.id)}
                disabled={bc.isBaseline}
                onChange={(e) => {
                  if (e.target.checked) setActiveCompareIds([...activeCompareIds, bc.id]);
                  else setActiveCompareIds(activeCompareIds.filter((x) => x !== bc.id));
                }}
                style={{ marginRight: 6 }}
              />
              {bc.label}
              {!bc.isBaseline && (
                <Popconfirm title={t('compare.removeBrand')} onConfirm={() => removeBrand(bc.id)}>
                  <DeleteOutlined style={{ marginLeft: 6, color: '#ff4d4f', cursor: 'pointer' }} />
                </Popconfirm>
              )}
            </Tag>
          ))}
        </Space>
      </Card>

      {/* 参数对比表 */}
      <Card size="small" title={t('compare.title')} style={{ marginBottom: 16 }}>
        <Typography.Text type="secondary">{t('compare.sameCapacity')}</Typography.Text>
        <Table
          dataSource={paramRows}
          columns={paramColumns as any}
          pagination={false}
          size="small"
          style={{ marginTop: 12 }}
          scroll={{ x: true }}
        />
      </Card>

      {/* 财务对比表 */}
      {activeBrands.length > 0 && (
        <Card size="small" title={t('compare.financeCompare')} style={{ marginBottom: 16 }}>
          {!industryFinance ? (
            <Text type="warning">{t('finance.noData')}</Text>
          ) : (
            <>
              <Row gutter={16} style={{ marginBottom: 16 }}>
                {activeBrands.map((bc) => {
                  const est = brandEstimates.get(bc.id);
                  if (!est) return null;
                  const dNpv = est.npv10 - industryNpv10;
                  return (
                    <Col span={Math.max(4, Math.floor(24 / activeBrands.length))} key={bc.id}>
                      <Statistic
                        title={`${bc.label} NPV10 Δ`}
                        value={dNpv}
                        precision={0}
                        prefix={dNpv >= 0 ? '+' : ''}
                        valueStyle={{ color: dNpv >= 0 ? '#389e0d' : '#cf1322' }}
                      />
                    </Col>
                  );
                })}
              </Row>
              <Table dataSource={finRows} columns={finColumns as any} pagination={false} size="small" scroll={{ x: true }} />
            </>
          )}
        </Card>
      )}
    </div>
  );
}
