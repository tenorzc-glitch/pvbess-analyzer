import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { InputParams, ScenarioConfig, FinanceResult } from '../types';
import { EngineScenarioResult } from '../engine/types';

/**
 * 品牌参数结构
 * rte：储能综合（往返）效率；充/放效率 = sqrt(rte)
 * costPerKWh：储能全包单价（含 PCS/线缆/安装）
 * dod：可用放电深度（行业 0.90 / 华为 1.00）
 * operatingDaysPerYear：年运行天数（行业 300 / 华为 315，高可用性）
 */
export interface BrandParams {
  rte: number;
  sohCurve: number[];
  costPerKWh: number;
  opexRate: number;
  dod: number;
  operatingDaysPerYear: number;
}

export type BrandKey = 'industry_avg' | 'HW';
export type BrandMap = Record<BrandKey, BrandParams>;

/** RTE → 充/放效率（对称拆分） */
export function splitRte(rte: number): { charge: number; discharge: number } {
  const half = Math.sqrt(rte);
  return { charge: half, discharge: half };
}

/**
 * 内置默认品牌参数（离线降级）
 * SOH 锚点：Year-10 行业 72% / 华为 80%（末年为 15 年寿命终点估值）
 */
export const FALLBACK_BRANDS: BrandMap = {
  industry_avg: {
    rte: 0.85,
    sohCurve: [
      1, 0.965, 0.935, 0.905, 0.875, 0.845, 0.815, 0.785, 0.755, 0.72,
      0.708, 0.696, 0.684, 0.67, 0.65,
    ],
    costPerKWh: 2000,
    opexRate: 0.015,
    dod: 0.9,
    operatingDaysPerYear: 300,
  },
  HW: {
    rte: 0.91,
    sohCurve: [
      1, 0.975, 0.955, 0.935, 0.915, 0.895, 0.875, 0.855, 0.83, 0.8,
      0.788, 0.776, 0.764, 0.745, 0.72,
    ],
    costPerKWh: 2400,
    opexRate: 0.012,
    dod: 1.0,
    operatingDaysPerYear: 315,
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
  const dod = Number(row.dod ?? fallback.dod);
  const days = Number(row.operatingDaysPerYear ?? fallback.operatingDaysPerYear);
  return {
    rte,
    sohCurve: sohCurve.length > 0 ? sohCurve : fallback.sohCurve,
    costPerKWh: Number(row.costPerKWh ?? fallback.costPerKWh),
    opexRate: Number(row.opexRate ?? fallback.opexRate),
    dod: dod > 0 && dod <= 1 ? dod : fallback.dod,
    operatingDaysPerYear: days > 0 && days <= 366 ? days : fallback.operatingDaysPerYear,
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

/** HW 方案简化财务估算结果（10 年口径字段用于报告对比章） */
export interface HWEstimate {
  capex: number;
  /** 首年 OPEX（华为口径：仅固定运维，无人工均衡/冷却液） */
  opexYear1: number;
  annualRevenue: number;
  /** 10 年累计总收益（名义值，含 SOH 衰减与电价增长） */
  revenue10: number;
  /** 10 年 NPV（含 −CAPEX） */
  npv10: number;
  /** 10 年放电吞吐 kWh（AC 交付，含 SOH 衰减） */
  throughput10: number;
  /** 15 年全寿命 NPV（旧口径，FinancePanel 沿用） */
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

/** 品牌收益放大系数：RTE 比 × DOD 比 × 运行天数比 */
export function brandGain(brands: BrandMap): number {
  return (brands.HW.rte / brands.industry_avg.rte)
    * (brands.HW.dod / brands.industry_avg.dod)
    * (brands.HW.operatingDaysPerYear / brands.industry_avg.operatingDaysPerYear);
}

/** 10 年放电吞吐（kWh，AC 交付）：首年放电量 × 逐年 SOH ×（可选）放大系数 */
export function computeThroughput10Kwh(
  annualDischargeKwh: number,
  sohCurve: number[],
  gain = 1
): number {
  let total = 0;
  for (let y = 1; y <= 10; y++) {
    const soh = sohCurve[Math.min(y - 1, sohCurve.length - 1)] ?? 1;
    total += annualDischargeKwh * gain * soh;
  }
  return total;
}

/**
 * HW 方案简化估算（不重仿真，与 ComparePanel 口径一致）：
 * 同容量下，年收益按 RTE 比 × DOD 比 × 运行天数比放大；
 * OPEX 为华为口径（固定运维率 × 华为储能 CAPEX + 光伏运维，无人工均衡/冷却液）；
 * NPV/10 年收益按品牌 SOH 曲线逐年衰减、按财务参数增长折现。
 */
export function estimateHWFinance(
  params: InputParams,
  scenario: ScenarioConfig,
  industryFinance: FinanceResult,
  brands: BrandMap,
  industrySim?: EngineScenarioResult | null
): HWEstimate {
  const capexHW = computeBrandCapex(params, scenario, brands.HW);
  const bessCapexHW = scenario.bessCapacity_kWh * brands.HW.costPerKWh;
  const pvCapex = scenario.pvCapacity_kWp * params.capex.pvCost_perkW;

  const gain = brandGain(brands);
  const annualRevenueHW = industryFinance.annualRevenue * gain;

  // 华为 OPEX：光伏运维 + 华为储能固定运维（无人工均衡、无冷却液更换）
  const opexHW1 = pvCapex * params.opex.pvFixedOpexRate + bessCapexHW * brands.HW.opexRate;

  const life = params.financial.projectLife;
  const r = params.financial.discountRate;
  const g = params.financial.priceGrowth;
  const og = params.financial.opexGrowth;

  // 逐年现金流（15 年全寿命 + 前 10 年口径）
  let npvHW = -capexHW;
  let npv10 = -capexHW;
  let revenue10 = 0;
  for (let y = 1; y <= life; y++) {
    const soh = brands.HW.sohCurve[Math.min(y - 1, brands.HW.sohCurve.length - 1)] ?? 1;
    const rev = annualRevenueHW * soh * Math.pow(1 + g, y - 1);
    const opex = opexHW1 * Math.pow(1 + og, y - 1);
    const dcf = (rev - opex) / Math.pow(1 + r, y);
    npvHW += dcf;
    if (y <= 10) {
      npv10 += dcf;
      revenue10 += rev;
    }
  }

  const irrHW = industryFinance.irr + (npvHW - industryFinance.npv) / Math.max(capexHW, 1) * 0.5;
  const paybackHW = capexHW / Math.max(annualRevenueHW - opexHW1, 1);

  // 10 年吞吐：行业首年放电量 × 华为放大系数 × 华为 SOH 衰减
  const annualDischarge = industrySim
    ? industrySim.monthlyResults.reduce((s, m) => s + (m.totals.bessDischarge_kWh || 0), 0)
    : 0;
  const throughput10 = computeThroughput10Kwh(annualDischarge, brands.HW.sohCurve, gain);

  return {
    capex: capexHW,
    opexYear1: opexHW1,
    annualRevenue: annualRevenueHW,
    revenue10,
    npv10,
    throughput10,
    npv: npvHW,
    irr: Math.max(-1, Math.min(1, irrHW)),
    paybackStatic: paybackHW,
  };
}
