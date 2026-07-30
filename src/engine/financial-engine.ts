/**
 * 财务计算引擎
 * 
 * 核心计算：
 * 1. 光储场景 vs 纯电网基准 → 节省费用
 * 2. N 年现金流（含 SOH 衰减、OPEX 增长、价格增长、绿电溢价、断电损失）
 * 3. 投资指标：NPV、IRR、回收期、LCOE、B/C Ratio
 */

import { InputParams, ScenarioConfig } from '../types';
import { CashflowRow, FinanceResult } from '../types/finance';
import { EngineScenarioResult, BaselineOutput } from './types';

/** 计算单个方案的完整财务结果 */
export function computeFinance(
  params: InputParams,
  scenario: ScenarioConfig,
  simResult: EngineScenarioResult,
  baseline: BaselineOutput
): FinanceResult {
  // 1. 计算 CAPEX
  const pvCapex = params.capex.pvCost_perkW * scenario.pvCapacity_kWp + params.capex.pvFixedCost;
  const bessCapex = params.capex.bessCost_perkWh * scenario.bessCapacity_kWh
    + params.capex.pcsCost_perkW * scenario.pcsPower_kW
    + params.capex.bessFixedCost;
  const bessCapexWithInstall = bessCapex * (1 + params.capex.installationPct);
  const totalCapex = pvCapex + bessCapexWithInstall + params.capex.remoteTransport;

  // 2. 首年节省（含绿电溢价、扣除断电损失）
  const year1Revenue = computeAnnualSaving(simResult, baseline, params);

  // 3. 首年 OPEX
  const year1Opex = computeAnnualOpex(params, scenario, totalCapex, 1);

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
    const yearOpex = computeAnnualOpex(params, scenario, totalCapex, y);
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
      pvGeneration_kWh: simResult.annual.pv_kWh * soh,
      gridSaving: baseline.annualGridCost - simResult.annual.gridCost * soh,
      dieselSaving: baseline.annualDieselCost - simResult.annual.dieselCost * soh,
      demandSaving: baseline.annualDemandCharge - simResult.annual.demandChargeCost,
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

  // LCOE
  let totalDiscountedEnergy = 0;
  let totalDiscountedCost = totalCapex;
    for (let y = 1; y <= projectLife; y++) {
    const df = Math.pow(1 + params.financial.discountRate, y);
    const soh = params.sohCurve[Math.min(y - 1, params.sohCurve.length - 1)] || 1.0;
    totalDiscountedEnergy += simResult.annual.pv_kWh * soh / df;
    totalDiscountedCost += cashflow[y].opex / df;
  }
  const lcoe = totalDiscountedCost / Math.max(totalDiscountedEnergy, 1);

  const benefitCostRatio = (npv + totalCapex) / totalCapex;

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
    baseline: {
      annualGridCost: baseline.annualGridCost,
      annualDieselCost: baseline.annualDieselCost,
      annualDemandCharge: baseline.annualDemandCharge,
      annualTotal: baseline.annualTotalCost,
    },
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

  // 断电损失（从收益中扣除）
  if (params.outageLoss?.enabled) {
    // 汇总未供电量
    let totalUnserved = 0;
    for (const mr of sim.monthlyResults) {
      totalUnserved += mr.totals.unserved_kWh || 0;
    }
    total -= (totalUnserved / 24) * params.outageLoss.dailyProductionValue * params.outageLoss.lossRate;
  }

  return total;
}

/** 计算年度 OPEX */
function computeAnnualOpex(
  params: InputParams,
  scenario: ScenarioConfig,
  totalCapex: number,
  year: number
): number {
  // 固定 OPEX
  const pvOpex = totalCapex * params.opex.pvFixedOpexRate; // simplified
  const bessOpex = params.opex.bessFixedOpexRate * scenario.bessCapacity_kWh * params.capex.bessCost_perkWh;

  // 人工均衡成本
  let balancingPerYear = 1; // default
  if (year <= 2) balancingPerYear = params.opex.balancingSchedule[0] || 0;
  else if (year <= 5) balancingPerYear = params.opex.balancingSchedule[1] || 1;
  else if (year <= 10) balancingPerYear = params.opex.balancingSchedule[2] || 2;
  else balancingPerYear = params.opex.balancingSchedule[3] || 3;

  const laborPerTrip = params.opex.balancingCrew * params.opex.balancingHours * params.opex.laborRate;
  const balancingCost = balancingPerYear * (laborPerTrip + params.opex.travelCost + params.opex.equipmentCost);

  // 冷却液更换
  const coolantCost = (year > 1 && year % params.opex.coolantInterval === 0)
    ? params.opex.coolantCost : 0;

  return pvOpex + bessOpex + balancingCost + coolantCost;
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

/** 计算回收期（年，线性插值） */
function computePayback(cashflows: number[]): number {
  let cumulative = 0;
  let prevYear = 0;
  let prevCum = 0;

  for (let t = 1; t < cashflows.length; t++) {
    cumulative += cashflows[t];
    if (cumulative >= 0 && prevCum < 0) {
      // 线性插值
      const fraction = -prevCum / (cumulative - prevCum);
      return prevYear + fraction;
    }
    prevYear = t;
    prevCum = cumulative;
  }

  return cashflows.length; // 未回收
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
