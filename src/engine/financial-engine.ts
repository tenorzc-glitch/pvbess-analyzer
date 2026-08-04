/**
 * 财务计算引擎
 * 
 * 核心计算：
 * 1. 光储场景 vs 纯电网基准 → 节省费用
 * 2. N 年现金流（含 SOH 衰减、OPEX 增长、价格增长、绿电溢价、断电损失）
 * 3. 投资指标：NPV、IRR、回收期、LCOE、B/C Ratio
 */

import { InputParams, ScenarioConfig, FinanceResult, CashflowRow } from '../types';
import { EngineScenarioResult, BaselineOutput } from './types';

/** 计算单个方案的完整财务结果 */
export function computeFinance(
  params: InputParams,
  scenario: ScenarioConfig,
  simResult: EngineScenarioResult,
  baseline: BaselineOutput
): FinanceResult {
  // 1. 计算 CAPEX（两项全包口径：PV 按 kWp、BESS 按 kWh，均含线缆/安装/运输，PCS 含于储能单价）
  const pvCapex = params.capex.pvCost_perkW * scenario.pvCapacity_kWp;
  const bessCapex = params.capex.bessCost_perkWh * scenario.bessCapacity_kWh;
  const totalCapex = pvCapex + bessCapex;

  // 2. 首年节省（含绿电溢价、扣除断电损失）
  const year1Revenue = computeAnnualSaving(simResult, baseline, params);

  // 2b. 首年节省四分量分解：a) PV 自用 + b) 储能套利 + c) 需量差 + d) 柴油差
  // 恒等式：a+b = baseline.annualGridCost − sim.annual.gridCost（逐时段口径，精确对账）
  const savingsBreakdown = {
    pvSelfUse: simResult.annual.pvSelfUseValue || 0,
    arbitrage: (simResult.annual.dischargeValue || 0) - (simResult.annual.gridChargeCost || 0),
    demand: baseline.annualDemandCharge - simResult.annual.demandChargeCost,
    diesel: baseline.annualDieselCost - simResult.annual.dieselCost,
    total: 0,
  };
  savingsBreakdown.total = savingsBreakdown.pvSelfUse + savingsBreakdown.arbitrage
    + savingsBreakdown.demand + savingsBreakdown.diesel;

  // 3. 首年 OPEX
  const year1Opex = computeAnnualOpex(params, scenario, pvCapex, bessCapex, 1, simResult);

  // 4. N 年现金流
  const cashflow: CashflowRow[] = [];
  let cumulativeDCF = -totalCapex;

  // Year 0
  cashflow.push({
    year: 0,
    soh: 1.0,
    pvGeneration_kWh: 0,
    gridSaving: 0,
    dieselSaving: 0,
    demandSaving: 0,
    totalRevenue: 0,
    opex: 0,
    replacementCost: 0,
    netCashflow: -totalCapex,
    discountedCashflow: -totalCapex,
    cumulativeDiscountedCF: -totalCapex,
  });

  const projectLife = params.financial.projectLife || 10;

  for (let y = 1; y <= projectLife; y++) {
    const soh = params.sohCurve[Math.min(y - 1, params.sohCurve.length - 1)] || 1.0;
    const yearRevenue = computeAnnualSaving(simResult, baseline, params);
    const yearOpex = computeAnnualOpex(params, scenario, pvCapex, bessCapex, y, simResult);
    const replacementCost = computeReplacementCost(params, scenario, y);

    // 应用年增长率
    const revenueGrowth = Math.pow(1 + params.financial.priceGrowth, y - 1);
    const opexGrowth = Math.pow(1 + params.financial.opexGrowth, y - 1);

    const totalRevenue = yearRevenue * revenueGrowth;
    const opex = yearOpex * opexGrowth;
    const netCF = totalRevenue - opex - replacementCost;

    const discountFactor = Math.pow(1 + params.financial.discountRate, y);
    const dcf = netCF / discountFactor;
    cumulativeDCF += dcf;

    cashflow.push({
      year: y,
      soh,
      // 光伏发电不随电池 SOH 衰减（光伏衰减已按决策剔除）
      pvGeneration_kWh: simResult.annual.pv_kWh,
      // 储能 SOH 衰减 → 节省逐年递减（对节省侧缩放，方向修正）
      gridSaving: (baseline.annualGridCost - simResult.annual.gridCost) * soh,
      dieselSaving: (baseline.annualDieselCost - simResult.annual.dieselCost) * soh,
      demandSaving: (baseline.annualDemandCharge - simResult.annual.demandChargeCost) * soh,
      totalRevenue,
      opex,
      replacementCost,
      netCashflow: netCF,
      discountedCashflow: dcf,
      cumulativeDiscountedCF: cumulativeDCF,
    });
  }

  // 5. 投资指标
  const npv = cumulativeDCF;
  const irr = computeIRR(cashflow.map(r => r.netCashflow));
  const paybackStatic = computePayback(cashflow.map(r => r.netCashflow));
  const paybackDynamic = computePayback(cashflow.map(r => r.discountedCashflow));

  // LCOE（光伏发电不计年衰减）
  let totalDiscountedEnergy = 0;
  let totalDiscountedCost = totalCapex;
  for (let y = 1; y <= projectLife; y++) {
    const df = Math.pow(1 + params.financial.discountRate, y);
    totalDiscountedEnergy += simResult.annual.pv_kWh / df;
    totalDiscountedCost += cashflow[y].opex / df;
  }
  const lcoe = totalDiscountedCost / Math.max(totalDiscountedEnergy, 1);

  const benefitCostRatio = (npv + totalCapex) / totalCapex;

  // 绿电溢价明细
  let greenPremiumDetail: FinanceResult['greenPremium'] = undefined;
  if (params.greenPremium?.enabled) {
    const annualGreenEnergy = simResult.annual.pv_kWh;
    const annualPremium = annualGreenEnergy * params.greenPremium.premiumRate;
    const totalPremium = annualPremium * params.financial.projectLife;
    greenPremiumDetail = { annualGreenEnergy_kWh: annualGreenEnergy, annualPremium, totalPremium };
  }

  // 断电损失明细（E8 量纲修复：未供电小时数 × 每小时产值 × 损失率）
  let outageLossDetail: FinanceResult['outageLoss'] = undefined;
  if (params.outageLoss?.enabled) {
    const totalUnservedHours = simResult.annual.unservedHours || 0;
    const annualLoss = totalUnservedHours
      * (params.outageLoss.dailyProductionValue / 24)
      * params.outageLoss.lossRate;
    outageLossDetail = { totalUnserved_hours: totalUnservedHours, annualLoss };
  }

  return {
    scenarioId: scenario.id,
    capex: totalCapex,
    annualRevenue: year1Revenue,
    npv,
    irr,
    paybackStatic,
    paybackDynamic,
    lcoe,
    benefitCostRatio,
    cashflow,
    savingsBreakdown,
    baseline: {
      annualGridCost: baseline.annualGridCost,
      annualDieselCost: baseline.annualDieselCost,
      annualDemandCharge: baseline.annualDemandCharge,
      annualTotal: baseline.annualTotalCost,
    },
    greenPremium: greenPremiumDetail,
    outageLoss: outageLossDetail,
  };
}

/** 计算年节省费用（相对于纯电网基准，含绿电溢价、扣除断电损失） */
function computeAnnualSaving(
  sim: EngineScenarioResult,
  baseline: BaselineOutput,
  params: InputParams
): number {
  const gridSaving = baseline.annualGridCost - sim.annual.gridCost;
  const dieselSaving = baseline.annualDieselCost - sim.annual.dieselCost;
  const demandSaving = baseline.annualDemandCharge - sim.annual.demandChargeCost;

  let total = gridSaving + dieselSaving + demandSaving;

  // 绿电溢价
  if (params.greenPremium?.enabled) {
    const greenEnergy = sim.annual.pv_kWh; // 光伏发电量
    total += greenEnergy * params.greenPremium.premiumRate;
  }

  // 断电损失（从收益中扣除；E8 量纲修复：未供电小时数 × 每小时产值 × 损失率）
  if (params.outageLoss?.enabled) {
    const unservedHours = sim.annual.unservedHours || 0;
    total -= unservedHours * (params.outageLoss.dailyProductionValue / 24) * params.outageLoss.lossRate;
  }

  return total;
}

/** 计算年度 OPEX */
function computeAnnualOpex(
  params: InputParams,
  scenario: ScenarioConfig,
  pvCapex: number,
  bessCapex: number,
  year: number,
  simResult?: EngineScenarioResult
): number {
  // 固定 OPEX：光伏运维费率 × 光伏 CAPEX（E5 修正：不再乘总 CAPEX）
  const pvOpex = pvCapex * params.opex.pvFixedOpexRate;
  const bessOpex = bessCapex * params.opex.bessFixedOpexRate;

  // 油机维护成本 = 年油机发电量 × 单位维护成本
  let dieselMaint = 0;
  const rate = params.opex.dieselMaintenancePerkWh ?? 0;
  if (rate > 0 && simResult) {
    let annualDiesel_kWh = 0;
    for (const mr of simResult.monthlyResults) {
      annualDiesel_kWh += mr.totals.diesel_kWh || 0;
    }
    dieselMaint = annualDiesel_kWh * rate;
  }

  // 人工上站均衡：前 3 年每年 N1 次，第 4 年起每年 N2 次
  // 单次人工 = 人数 × 每柜工时 × 柜数 × 人工单价；柜数 = ceil(BESS / 单柜容量)
  const visitsPerYear = year <= 3 ? params.opex.balancingVisitsY1to3 : params.opex.balancingVisitsY4plus;
  const cabinets = Math.max(1, Math.ceil(scenario.bessCapacity_kWh / params.opex.cabinetEnergyKwh));
  const laborPerTrip = params.opex.balancingCrew * params.opex.balancingHoursPerCabinet * cabinets * params.opex.laborRate;
  const balancingCost = visitsPerYear * (laborPerTrip + params.opex.travelCost + params.opex.equipmentCost);

  // 冷却液更换（每 coolantInterval 年一次，第 1 年不换）
  const coolantCost = (year > 1 && year % params.opex.coolantInterval === 0)
    ? params.opex.coolantCost : 0;

  return pvOpex + bessOpex + dieselMaint + balancingCost + coolantCost;
}

/** 计算电池更换成本 */
function computeReplacementCost(
  params: InputParams,
  scenario: ScenarioConfig,
  _year: number
): number {
  // 简化：不包含电池更换（15年寿命内无需更换）
  // 如需更换逻辑在此扩展
  return 0;
}

/** 牛顿法计算 IRR */
function computeIRR(cashflows: number[]): number {
  const maxIter = 100;
  const tolerance = 1e-7;
  let rate = 0.1;

  for (let i = 0; i < maxIter; i++) {
    let npv = 0;
    let dnpv = 0;

    for (let t = 0; t < cashflows.length; t++) {
      const df = Math.pow(1 + rate, t);
      npv += cashflows[t] / df;
      dnpv += (-t * cashflows[t]) / Math.pow(1 + rate, t + 1);
    }

    if (Math.abs(npv) < tolerance) return rate;
    if (Math.abs(dnpv) < 1e-10) break;

    rate = rate - npv / dnpv;
    if (rate < -0.99) rate = -0.5;
    if (rate > 10) rate = 5;
  }

  return rate;
}

/** 计算回收期（年，线性插值；cashflows[0] 为第 0 年 −CAPEX） */
function computePayback(cashflows: number[]): number {
  // E1 修正：必须从第 0 年的负 CAPEX 开始累计，否则永远返回"未回收"
  let cumulative = cashflows[0] ?? 0;

  for (let t = 1; t < cashflows.length; t++) {
    const prevCum = cumulative;
    cumulative += cashflows[t];
    if (cumulative >= 0 && prevCum < 0) {
      // 线性插值：第 t-1 年到第 t 年之间回收
      const fraction = -prevCum / (cumulative - prevCum);
      return (t - 1) + fraction;
    }
  }

  return cashflows.length - 1; // 寿命期内未回收，返回项目寿命
}

/** 批量计算所有方案的财务结果 */
export function computeAllFinance(
  params: InputParams,
  scenarios: ScenarioConfig[],
  simResults: EngineScenarioResult[],
  baselines: BaselineOutput[]
): FinanceResult[] {
  return scenarios.map((scenario, i) =>
    computeFinance(params, scenario, simResults[i], baselines[i])
  );
}
