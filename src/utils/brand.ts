import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { InputParams, ScenarioConfig, FinanceResult } from '../types';

/** 品牌参数结构 */
export interface BrandParams {
  efficiencyCharge: number;
  efficiencyDischarge: number;
  sohCurve: number[];
  costPerKWh: number;
  pcsCostPerKW: number;
  opexRate: number;
}

export type BrandKey = 'industry_avg' | 'HW';
export type BrandMap = Record<BrandKey, BrandParams>;

/** 内置默认品牌参数（离线降级） */
export const FALLBACK_BRANDS: BrandMap = {
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
export function normalizeBrand(row: any, fallback: BrandParams): BrandParams {
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

/** 从 Supabase 读取品牌参数；失败返回内置默认值 */
export async function loadBrandParams(): Promise<{ brands: BrandMap; source: 'supabase' | 'fallback' }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { brands: FALLBACK_BRANDS, source: 'fallback' };
  }
  try {
    const { data, error } = await supabase.from('brand_params').select('*');
    if (error || !data) throw error;
    const map: BrandMap = { ...FALLBACK_BRANDS };
    for (const row of data) {
      const key = row?.brand ?? row?.key ?? row?.id;
      if (key === 'industry_avg') map.industry_avg = normalizeBrand(row, FALLBACK_BRANDS.industry_avg);
      else if (key === 'HW') map.HW = normalizeBrand(row, FALLBACK_BRANDS.HW);
    }
    return { brands: map, source: 'supabase' };
  } catch {
    return { brands: FALLBACK_BRANDS, source: 'fallback' };
  }
}

/** HW 方案简化财务估算结果 */
export interface HWEstimate {
  capex: number;
  annualRevenue: number;
  npv: number;
  irr: number;
  paybackStatic: number;
}

/** 基于品牌参数 + 方案容量计算 CAPEX（简化估算） */
export function computeBrandCapex(params: InputParams, scenario: ScenarioConfig, brand: BrandParams): number {
  const pvCost = params.pv.capacity_kWp * params.capex.pvCost_perkW + params.capex.pvFixedCost;
  const bessCost = scenario.bessCapacity_kWh * brand.costPerKWh;
  const pcsCost = scenario.pcsPower_kW * brand.pcsCostPerKW;
  const installation = (bessCost + pcsCost) * params.capex.installationPct;
  return pvCost + bessCost + pcsCost + installation + params.capex.bessFixedCost + params.capex.remoteTransport;
}

/**
 * HW 方案粗略估算（基于品牌差异做简化调整，与 ComparePanel 口径一致）：
 * 同容量下，用充放电效率乘积差异调整年收益，用 OPEX 率差异调整年净收益，
 * NPV 在基准上叠加 CAPEX 差与年净收益差的年金现值。
 */
export function estimateHWFinance(
  params: InputParams,
  scenario: ScenarioConfig,
  industryFinance: FinanceResult,
  brands: BrandMap
): HWEstimate {
  const capexHW = computeBrandCapex(params, scenario, brands.HW);
  const capexBase = computeBrandCapex(params, scenario, brands.industry_avg);
  const capexDelta = capexHW - capexBase;

  const effBase = brands.industry_avg.efficiencyCharge * brands.industry_avg.efficiencyDischarge;
  const effHW = brands.HW.efficiencyCharge * brands.HW.efficiencyDischarge;
  const effGain = effHW - effBase;
  const annualRevenueHW = industryFinance.annualRevenue * (1 + effGain);

  const opexDelta = capexHW * brands.HW.opexRate - capexBase * brands.industry_avg.opexRate;
  const annualNetHW = annualRevenueHW - opexDelta;

  const life = params.financial.projectLife;
  const r = params.financial.discountRate;
  const annuityFactor = (1 - Math.pow(1 + r, -life)) / r;
  const npvHW = industryFinance.npv - capexDelta + (annualNetHW - industryFinance.annualRevenue) * annuityFactor;

  const irrHW = industryFinance.irr + (npvHW - industryFinance.npv) / Math.max(capexHW, 1) * 0.5;
  const paybackHW = capexHW / Math.max(annualNetHW, 1);

  return {
    capex: capexHW,
    annualRevenue: annualRevenueHW,
    npv: npvHW,
    irr: Math.max(-1, Math.min(1, irrHW)),
    paybackStatic: paybackHW,
  };
}
