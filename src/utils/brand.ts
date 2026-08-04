import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { InputParams, ScenarioConfig, FinanceResult } from '../types';

/**
 * 品牌参数结构
 * rte：储能综合（往返）效率；充/放效率 = sqrt(rte)
 * costPerKWh：储能全包单价（含 PCS/线缆/安装）
 */
export interface BrandParams {
  rte: number;
  sohCurve: number[];
  costPerKWh: number;
  opexRate: number;
}

export type BrandKey = 'industry_avg' | 'HW';
export type BrandMap = Record<BrandKey, BrandParams>;

/** RTE → 充/放效率（对称拆分） */
export function splitRte(rte: number): { charge: number; discharge: number } {
  const half = Math.sqrt(rte);
  return { charge: half, discharge: half };
}

/** 内置默认品牌参数（离线降级）：行业 RTE 85% / 华为 91%，全包单价 2000 / 2400 */
export const FALLBACK_BRANDS: BrandMap = {
  industry_avg: {
    rte: 0.85,
    sohCurve: [
      1, 0.975, 0.95, 0.925, 0.9, 0.875, 0.85, 0.825, 0.8, 0.775,
      0.75, 0.725, 0.7, 0.675, 0.65,
    ],
    costPerKWh: 2000,
    opexRate: 0.015,
  },
  HW: {
    rte: 0.91,
    sohCurve: [
      1, 0.98, 0.96, 0.94, 0.92, 0.9, 0.88, 0.86, 0.84, 0.82,
      0.80, 0.78, 0.76, 0.74, 0.72,
    ],
    costPerKWh: 2400,
    opexRate: 0.012,
  },
};

/** 把数据库行 / 任意松散对象规整成 BrandParams（兼容旧字段 efficiencyCharge×efficiencyDischarge ≈ rte） */
export function normalizeBrand(row: any, fallback: BrandParams): BrandParams {
  if (!row || typeof row !== 'object') return fallback;
  const sohRaw = Array.isArray(row.sohCurve) ? row.sohCurve : fallback.sohCurve;
  const sohCurve = sohRaw.map((v: any) => Number(v)).filter((v: number) => !Number.isNaN(v));
  let rte = Number(row.rte);
  if (Number.isNaN(rte) || rte <= 0 || rte > 1) {
    const ec = Number(row.efficiencyCharge);
    const ed = Number(row.efficiencyDischarge);
    rte = !Number.isNaN(ec) && !Number.isNaN(ed) && ec > 0 && ed > 0 ? ec * ed : fallback.rte;
  }
  return {
    rte,
    sohCurve: sohCurve.length > 0 ? sohCurve : fallback.sohCurve,
    costPerKWh: Number(row.costPerKWh ?? fallback.costPerKWh),
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

/** 基于品牌参数 + 方案容量计算 CAPEX（两项全包口径：PV 按 params、BESS 按品牌全包单价） */
export function computeBrandCapex(params: InputParams, scenario: ScenarioConfig, brand: BrandParams): number {
  const pvCost = scenario.pvCapacity_kWp * params.capex.pvCost_perkW;
  const bessCost = scenario.bessCapacity_kWh * brand.costPerKWh;
  return pvCost + bessCost;
}

/**
 * HW 方案粗略估算（基于品牌差异做简化调整，与 ComparePanel 口径一致）：
 * 同容量下，用 RTE 差异调整年收益，用 OPEX 率差异调整年净收益，
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

  const effGain = brands.HW.rte - brands.industry_avg.rte;
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
