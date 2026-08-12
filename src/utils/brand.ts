import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { InputParams, ScenarioConfig, FinanceResult } from '../types';
import { EngineScenarioResult } from '../engine/types';

/**
 * 品牌参数结构
 * rte：储能综合（往返）效率；充/放效率 = sqrt(rte)
 * costPerKWh：储能全包单价（含 PCS/线缆/安装）
 * dod：可用放电深度（行业 0.90 / 华为 1.00）
 * operatingDaysPerYear：年运行天数（行业 300 / 华为 315，高可用性）
 *
 * 扩展字段（模块B）：
 * - 离网 SOC 边界：socMinOffgrid/socMaxOffgrid（停电备供场景的可用窗口）
 * - 隔离变压器：needsIsolationTransformer + transformerEfficiencyLoss（有效 RTE 修正）
 * - 运维开关：needsManualBalancing / needsCoolantReplacement（计入 OPEX）
 * - SOC 校准：autoCalibration=false 时按 calibrationVisitCost/IntervalMonths 计入 OPEX
 */
export interface BrandParams {
  rte: number;
  sohCurve: number[];
  costPerKWh: number;
  opexRate: number;
  dod: number;
  operatingDaysPerYear: number;
  /** 离网最低 SOC（低于此值柴发介入/停机保护） */
  socMinOffgrid: number;
  /** 离网最高 SOC（充电截止） */
  socMaxOffgrid: number;
  /** 是否需要隔离变压器（IT/TT 接地） */
  needsIsolationTransformer: boolean;
  /** 变压器效率损失（干式变满载 ~2%） */
  transformerEfficiencyLoss: number;
  /** 是否需要人工上站均衡（false → OPEX 中均衡成本归零） */
  needsManualBalancing: boolean;
  /** 是否需要定期更换冷却液 */
  needsCoolantReplacement: boolean;
  /** 冷却液更换周期（年） */
  coolantIntervalYears: number;
  /** 单次冷却液更换成本 */
  coolantCostPerEvent: number;
  /** 长期离网是否具备自动校准 SOC（false → 需人工上站校准，计入 OPEX） */
  autoCalibration: boolean;
  /** 人工上站校准单次成本 */
  calibrationVisitCost: number;
  /** 校准周期（月） */
  calibrationIntervalMonths: number;
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
 * 扩展字段预设：行业基准 = 常规风冷/液冷工商业储能；HW = 组串式+智能均衡
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
    socMinOffgrid: 0.15,
    socMaxOffgrid: 0.95,
    needsIsolationTransformer: true,
    transformerEfficiencyLoss: 0.02,
    needsManualBalancing: true,
    needsCoolantReplacement: true,
    coolantIntervalYears: 5,
    coolantCostPerEvent: 20000,
    autoCalibration: false,
    calibrationVisitCost: 3000,
    calibrationIntervalMonths: 6,
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
    socMinOffgrid: 0.10,
    socMaxOffgrid: 0.95,
    needsIsolationTransformer: false,
    transformerEfficiencyLoss: 0,
    needsManualBalancing: false,
    needsCoolantReplacement: true,
    coolantIntervalYears: 5,
    coolantCostPerEvent: 20000,
    autoCalibration: true,
    calibrationVisitCost: 3000,
    calibrationIntervalMonths: 6,
  },
};

/** 把数据库行 / 任意松散对象规整成 BrandParams（兼容旧字段 efficiencyCharge×efficiencyDischarge ≈ rte；扩展字段缺失时取 fallback） */
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
  const num = (v: any, fb: number) => { const n = Number(v); return Number.isNaN(n) ? fb : n; };
  const bool = (v: any, fb: boolean) => (typeof v === 'boolean' ? v : fb);
  return {
    rte,
    sohCurve: sohCurve.length > 0 ? sohCurve : fallback.sohCurve,
    costPerKWh: num(row.costPerKWh, fallback.costPerKWh),
    opexRate: num(row.opexRate, fallback.opexRate),
    dod: dod > 0 && dod <= 1 ? dod : fallback.dod,
    operatingDaysPerYear: days > 0 && days <= 366 ? days : fallback.operatingDaysPerYear,
    socMinOffgrid: num(row.socMinOffgrid, fallback.socMinOffgrid),
    socMaxOffgrid: num(row.socMaxOffgrid, fallback.socMaxOffgrid),
    needsIsolationTransformer: bool(row.needsIsolationTransformer, fallback.needsIsolationTransformer),
    transformerEfficiencyLoss: num(row.transformerEfficiencyLoss, fallback.transformerEfficiencyLoss),
    needsManualBalancing: bool(row.needsManualBalancing, fallback.needsManualBalancing),
    needsCoolantReplacement: bool(row.needsCoolantReplacement, fallback.needsCoolantReplacement),
    coolantIntervalYears: num(row.coolantIntervalYears, fallback.coolantIntervalYears),
    coolantCostPerEvent: num(row.coolantCostPerEvent, fallback.coolantCostPerEvent),
    autoCalibration: bool(row.autoCalibration, fallback.autoCalibration),
    calibrationVisitCost: num(row.calibrationVisitCost, fallback.calibrationVisitCost),
    calibrationIntervalMonths: num(row.calibrationIntervalMonths, fallback.calibrationIntervalMonths),
  };
}

/** 从 Supabase 读取品牌参数；失败返回内置默认值
 * 表结构：brand_params(id, name, display_name, params JSONB, ...)
 * 行键读 name 列（旧代码误读 brand/key/id 导致静默跳过，2026-08 修复）；
 * 参数嵌套在 params JSONB 中（旧代码直接把整行传给 normalizeBrand，永远 fallback）。
 */
export async function loadBrandParams(): Promise<{ brands: BrandMap; source: 'supabase' | 'fallback' }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { brands: FALLBACK_BRANDS, source: 'fallback' };
  }
  try {
    const { data, error } = await supabase.from('brand_params').select('*');
    if (error || !data) throw error;
    const map: BrandMap = { ...FALLBACK_BRANDS };
    let matched = 0;
    for (const row of data) {
      const key = row?.name ?? row?.brand ?? row?.key;
      const payload = row?.params && typeof row.params === 'object' ? row.params : row;
      if (key === 'industry_avg') { map.industry_avg = normalizeBrand(payload, FALLBACK_BRANDS.industry_avg); matched++; }
      else if (key === 'HW') { map.HW = normalizeBrand(payload, FALLBACK_BRANDS.HW); matched++; }
    }
    // 一行都没匹配上视为读取失败（表结构漂移），回退内置
    if (matched === 0) throw new Error('no known brand rows matched');
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

/** 有效 RTE：需要隔离变压器时扣除变压器效率损失 */
function effRte(b: BrandParams): number {
  return b.rte * (b.needsIsolationTransformer ? 1 - b.transformerEfficiencyLoss : 1);
}

/** 离网可用电量窗口 =（离网 SOC 上限 − 下限）× DOD */
function usableWindow(b: BrandParams): number {
  return (b.socMaxOffgrid - b.socMinOffgrid) * b.dod;
}

/**
 * 品牌年度 OPEX（含扩展运维开关）：
 * - 固定运维：PV × pvFixedOpexRate + 品牌 BESS CAPEX × opexRate
 * - 人工均衡：needsManualBalancing=false 时归零；否则按 params.opex 均衡模型
 * - 冷却液：needsCoolantReplacement 且逢 coolantIntervalYears 年份（第 1 年不换）
 * - SOC 校准：autoCalibration=false 时按 12/intervalMonths × visitCost 计入
 */
function brandOpexYear(
  params: InputParams,
  scenario: ScenarioConfig,
  brand: BrandParams,
  year: number,
): number {
  const pvCapex = scenario.pvCapacity_kWp * params.capex.pvCost_perkW;
  const bessCapex = scenario.bessCapacity_kWh * brand.costPerKWh;
  let opex = pvCapex * params.opex.pvFixedOpexRate + bessCapex * brand.opexRate;

  if (brand.needsManualBalancing) {
    const visits = year <= 3 ? params.opex.balancingVisitsY1to3 : params.opex.balancingVisitsY4plus;
    const cabinets = Math.max(1, Math.ceil(scenario.bessCapacity_kWh / params.opex.cabinetEnergyKwh));
    const labor = params.opex.balancingCrew * params.opex.balancingHoursPerCabinet * cabinets * params.opex.laborRate;
    opex += visits * (labor + params.opex.travelCost + params.opex.equipmentCost);
  }
  if (brand.needsCoolantReplacement && year > 1 && year % brand.coolantIntervalYears === 0) {
    opex += brand.coolantCostPerEvent;
  }
  if (!brand.autoCalibration) {
    opex += (12 / brand.calibrationIntervalMonths) * brand.calibrationVisitCost;
  }
  return opex;
}

/**
 * 品牌情景现金流核心（estimateHWFinance 与逐因子归因共用，口径单源）：
 * gain 始终相对行业基线定义（brand=行业时 gain=1），因此行业/华为/任意混合参数都可注入。
 * gain = 有效RTE比 × 可用电量窗口比 × 运行天数比（有效RTE含变压器损失，窗口=(SOC上限−下限)×DOD）。
 */
function runBrandCashflow(
  params: InputParams,
  scenario: ScenarioConfig,
  industryFinance: FinanceResult,
  ind: BrandParams,
  brand: BrandParams,
  annualDischargeKwh: number,
): { capex: number; opexYear1: number; annualRevenue: number; revenue10: number; npv10: number; throughput10: number; npvLife: number } {
  const pvCapex = scenario.pvCapacity_kWp * params.capex.pvCost_perkW;
  const bessCapex = scenario.bessCapacity_kWh * brand.costPerKWh;
  const capex = pvCapex + bessCapex;
  const gain =
    (effRte(brand) / effRte(ind))
    * (usableWindow(brand) / usableWindow(ind))
    * (brand.operatingDaysPerYear / ind.operatingDaysPerYear);
  const annualRevenue = industryFinance.annualRevenue * gain;

  const life = params.financial.projectLife;
  const r = params.financial.discountRate;
  const g = params.financial.priceGrowth;
  const og = params.financial.opexGrowth;

  const opexYear1 = brandOpexYear(params, scenario, brand, 1);

  let npvLife = -capex;
  let npv10 = -capex;
  let revenue10 = 0;
  for (let y = 1; y <= life; y++) {
    const soh = brand.sohCurve[Math.min(y - 1, brand.sohCurve.length - 1)] ?? 1;
    const rev = annualRevenue * soh * Math.pow(1 + g, y - 1);
    const opex = brandOpexYear(params, scenario, brand, y) * Math.pow(1 + og, y - 1);
    const dcf = (rev - opex) / Math.pow(1 + r, y);
    npvLife += dcf;
    if (y <= 10) {
      npv10 += dcf;
      revenue10 += rev;
    }
  }
  const throughput10 = computeThroughput10Kwh(annualDischargeKwh, brand.sohCurve, gain);
  return { capex, opexYear1, annualRevenue, revenue10, npv10, throughput10, npvLife };
}

/**
 * 品牌方案简化估算（不重仿真，与 ComparePanel 口径一致）：
 * 同容量下，年收益按 有效RTE比 × 可用电量窗口比 × 运行天数比 放大；
 * OPEX 按品牌开关（人工均衡/冷却液/SOC校准）逐项计入；
 * NPV/10 年收益按品牌 SOH 曲线逐年衰减、按财务参数增长折现。
 *
 * estimateHWFinance 保留为 HW 便捷封装；多品牌请用 estimateBrandFinance。
 */
export function estimateBrandFinance(
  params: InputParams,
  scenario: ScenarioConfig,
  industryFinance: FinanceResult,
  baseline: BrandParams,
  brand: BrandParams,
  industrySim?: EngineScenarioResult | null
): HWEstimate {
  const annualDischarge = industrySim
    ? industrySim.monthlyResults.reduce((s, m) => s + (m.totals.bessDischarge_kWh || 0), 0)
    : 0;
  const core = runBrandCashflow(params, scenario, industryFinance, baseline, brand, annualDischarge);

  const irrB = industryFinance.irr + (core.npvLife - industryFinance.npv) / Math.max(core.capex, 1) * 0.5;
  const paybackB = core.capex / Math.max(core.annualRevenue - core.opexYear1, 1);

  return {
    capex: core.capex,
    opexYear1: core.opexYear1,
    annualRevenue: core.annualRevenue,
    revenue10: core.revenue10,
    npv10: core.npv10,
    throughput10: core.throughput10,
    npv: core.npvLife,
    irr: Math.max(-1, Math.min(1, irrB)),
    paybackStatic: paybackB,
  };
}

export function estimateHWFinance(
  params: InputParams,
  scenario: ScenarioConfig,
  industryFinance: FinanceResult,
  brands: BrandMap,
  industrySim?: EngineScenarioResult | null
): HWEstimate {
  return estimateBrandFinance(params, scenario, industryFinance, brands.industry_avg, brands.HW, industrySim);
}

/**
 * 锚定版品牌估算：模型口径（runBrandCashflow）与引擎口径（industryFinance）存在系统性差异
 * （SOH 曲线、校准成本等），直接展示模型绝对值会让"参数=行业基准的品牌"看起来比行业差。
 * 修正：展示值 = 引擎行业值 + （模型品牌值 − 模型行业基线值）。
 * 这样参数与行业一致的品牌严格等于行业引擎值（Δ=0），增量关系保持不变。
 */
export function estimateBrandFinanceAnchored(
  params: InputParams,
  scenario: ScenarioConfig,
  industryFinance: FinanceResult,
  baseline: BrandParams,
  brand: BrandParams,
  industrySim: EngineScenarioResult | null | undefined,
  engineMetrics: { npv10: number; revenue10: number; opexYear1: number; throughput10: number },
): HWEstimate {
  const brandEst = estimateBrandFinance(params, scenario, industryFinance, baseline, brand, industrySim);
  const baseEst = estimateBrandFinance(params, scenario, industryFinance, baseline, baseline, industrySim);
  return {
    capex: industryFinance.capex + (brandEst.capex - baseEst.capex),
    opexYear1: engineMetrics.opexYear1 + (brandEst.opexYear1 - baseEst.opexYear1),
    annualRevenue: industryFinance.annualRevenue + (brandEst.annualRevenue - baseEst.annualRevenue),
    revenue10: engineMetrics.revenue10 + (brandEst.revenue10 - baseEst.revenue10),
    npv10: engineMetrics.npv10 + (brandEst.npv10 - baseEst.npv10),
    throughput10: engineMetrics.throughput10 + (brandEst.throughput10 - baseEst.throughput10),
    npv: industryFinance.npv + (brandEst.npv - baseEst.npv),
    irr: industryFinance.irr + (brandEst.irr - baseEst.irr),
    paybackStatic: industryFinance.paybackStatic + (brandEst.paybackStatic - baseEst.paybackStatic),
  };
}

/** 归因因子（顺序固定；顺序影响分项分配、不影响合计——页面须带 indicative 声明）
 * 模块B扩展：transformer（隔离变压器）、socOffgrid（离网SOC窗口）、balancing（人工均衡）、
 * coolant（冷却液）、calibration（SOC校准）加入归因链
 */
export type AttributionFactor =
  | 'rte' | 'transformer' | 'dod' | 'socOffgrid' | 'days' | 'soh'
  | 'opex' | 'balancing' | 'coolant' | 'calibration' | 'capex';
export const ATTRIBUTION_ORDER: AttributionFactor[] = [
  'rte', 'transformer', 'dod', 'socOffgrid', 'days', 'soh',
  'opex', 'balancing', 'coolant', 'calibration', 'capex',
];

export interface FactorStep {
  factor: AttributionFactor;
  /** 替换该因子后的累计水平 */
  throughput10: number;
  npv10: number;
  /** 该因子的边际贡献（与上一步差值） */
  dThroughput: number;
  dNpv: number;
}

export interface FactorAttribution {
  base: { throughput10: number; npv10: number };
  steps: FactorStep[];
  final: { throughput10: number; npv10: number };
}

/**
 * 逐因子瀑布归因（顺序替换法）：从行业基线出发，按 ATTRIBUTION_ORDER 每次把一个
 * 因子替换为 HW 值重算，差值即该因子边际贡献。数学上 final 恒等于 estimateHWFinance
 * 全量输出（可作为断言）；opex/capex 不影响吞吐量（dThroughput=0，不进吞吐瀑布）。
 */
export function computeFactorAttribution(
  params: InputParams,
  scenario: ScenarioConfig,
  industryFinance: FinanceResult,
  baseline: BrandParams,
  target: BrandParams,
  industrySim?: EngineScenarioResult | null,
): FactorAttribution {
  const ind = baseline;
  const hwB = target;
  const annualDischarge = industrySim
    ? industrySim.monthlyResults.reduce((s, m) => s + (m.totals.bessDischarge_kWh || 0), 0)
    : 0;

  const applyFactor = (mixed: BrandParams, f: AttributionFactor): BrandParams => {
    const m = { ...mixed, sohCurve: [...mixed.sohCurve] };
    if (f === 'rte') m.rte = hwB.rte;
    else if (f === 'transformer') {
      m.needsIsolationTransformer = hwB.needsIsolationTransformer;
      m.transformerEfficiencyLoss = hwB.transformerEfficiencyLoss;
    }
    else if (f === 'dod') m.dod = hwB.dod;
    else if (f === 'socOffgrid') {
      m.socMinOffgrid = hwB.socMinOffgrid;
      m.socMaxOffgrid = hwB.socMaxOffgrid;
    }
    else if (f === 'days') m.operatingDaysPerYear = hwB.operatingDaysPerYear;
    else if (f === 'soh') m.sohCurve = [...hwB.sohCurve];
    else if (f === 'opex') m.opexRate = hwB.opexRate;
    else if (f === 'balancing') m.needsManualBalancing = hwB.needsManualBalancing;
    else if (f === 'coolant') {
      m.needsCoolantReplacement = hwB.needsCoolantReplacement;
      m.coolantIntervalYears = hwB.coolantIntervalYears;
      m.coolantCostPerEvent = hwB.coolantCostPerEvent;
    }
    else if (f === 'calibration') {
      m.autoCalibration = hwB.autoCalibration;
      m.calibrationVisitCost = hwB.calibrationVisitCost;
      m.calibrationIntervalMonths = hwB.calibrationIntervalMonths;
    }
    else if (f === 'capex') m.costPerKWh = hwB.costPerKWh;
    return m;
  };

  const baseRun = runBrandCashflow(params, scenario, industryFinance, ind, ind, annualDischarge);
  const steps: FactorStep[] = [];
  let prev = { throughput10: baseRun.throughput10, npv10: baseRun.npv10 };
  let mixed: BrandParams = { ...ind, sohCurve: [...ind.sohCurve] };
  for (const f of ATTRIBUTION_ORDER) {
    mixed = applyFactor(mixed, f);
    const cur = runBrandCashflow(params, scenario, industryFinance, ind, mixed, annualDischarge);
    steps.push({
      factor: f,
      throughput10: cur.throughput10,
      npv10: cur.npv10,
      dThroughput: cur.throughput10 - prev.throughput10,
      dNpv: cur.npv10 - prev.npv10,
    });
    prev = { throughput10: cur.throughput10, npv10: cur.npv10 };
  }

  return {
    base: { throughput10: baseRun.throughput10, npv10: baseRun.npv10 },
    steps,
    final: prev,
  };
}
