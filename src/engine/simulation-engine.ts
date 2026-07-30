/**
 * 调度仿真引擎
 * 
 * 核心逻辑：15 分钟步长 × 12 典型月日
 * 光伏优先供负荷 → 余量充电池 → 弃光
 * 负荷不足 ← 电池放电 ← 电网购电 ← 柴油机（最后手段）
 */

import { InputParams, ScenarioConfig, ProfileData, ProfileInterval } from '../types';
import {
  SimulationInput, DispatchState, DispatchInterval,
  EngineMonthResult, EngineScenarioResult, EngineAnnualSummary, BaselineOutput
} from './types';

/** 每月天数 */
const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// ─── 调度核心 ───────────────────────────────────────────────

/** 运行单个场景的完整年度仿真 */
export function runScenarioSimulation(
  params: InputParams,
  scenario: ScenarioConfig,
  profile: ProfileData
): EngineScenarioResult {
  const monthlyResults: EngineMonthResult[] = [];

  for (let m = 0; m < 12; m++) {
    const monthProfile = profile[m];
    if (!monthProfile || monthProfile.length === 0) continue;

    const result = runMonthlySimulation(params, scenario, monthProfile, m + 1);
    monthlyResults.push(result);
  }

  const annual = computeAnnualSummary(params, scenario, monthlyResults);

  return {
    scenarioId: scenario.id,
    monthlyResults,
    annual
  };
}

/** 运行单月调度仿真 */
function runMonthlySimulation(
  params: InputParams,
  scenario: ScenarioConfig,
  monthProfile: ProfileInterval[],
  month: number
): EngineMonthResult {
  const intervals: DispatchInterval[] = [];
  const bessCapacity = scenario.bessCapacity_kWh;
  const pcsPower = scenario.pcsPower_kW;
  const pvCapacity = scenario.pvCapacity_kWp;
  const days = DAYS_PER_MONTH[month - 1];

  // 初始化状态
  let state: DispatchState = {
    soc: params.bess.socInitial,
    prevDGOn: false,
  };

  // 柴油机最低稳定功率
  const dgMinStable = params.diesel.minStablePower_kW;
  const dgRatedPower = params.diesel.ratedPower_kW;
  const dgEfficiency = params.diesel.efficiency_kWhPerL;

  const stepH = params.timeStep; // 0.25h

  for (let t = 0; t < monthProfile.length; t++) {
    const prof = monthProfile[t];
    const result = dispatchInterval(
      params, scenario, prof, state, stepH,
      bessCapacity, pcsPower, pvCapacity,
      dgMinStable, dgRatedPower, dgEfficiency
    );

    intervals.push(result);
    state = {
      soc: result.socEnd,
      prevDGOn: result.dieselGen > 0,
    };
  }

  // 计算月度汇总
  const totals = computeMonthTotals(intervals, days, stepH);

  return { month, days, intervals, totals };
}

/** 单个 15 分钟时段调度 */
function dispatchInterval(
  params: InputParams,
  scenario: ScenarioConfig,
  prof: ProfileInterval,
  state: DispatchState,
  stepH: number,
  bessCapacity: number,
  pcsPower: number,
  pvCapacity: number,
  dgMinStable: number,
  dgRatedPower: number,
  dgEfficiency: number
): DispatchInterval {
  // 1. 光伏发电
  const pvGen = prof.pvPerUnit * pvCapacity * params.pv.deratingFactor;

  // 2. 净负荷（正值 = 不足，负值 = 余量）
  const netLoad = prof.load_kW - pvGen;
  const pvExcess = netLoad < 0 ? -netLoad : 0;

  // 3. 储能充放电
  let bessCharge = 0;
  let bessDischarge = 0;
  let remainingLoad = netLoad;

  if (netLoad < 0) {
    // 光伏余量 → 充电
    const excess = -netLoad;
    // 可充容量 (kWh → kW，除以效率)
    const chargeCapacityEnergy = (params.bess.socMax - state.soc) * bessCapacity;
    const chargeCapacityPower = chargeCapacityEnergy / (stepH * params.bess.efficiencyCharge);
    const maxCharge = Math.min(excess, chargeCapacityPower, pcsPower);
    bessCharge = maxCharge;
    remainingLoad = -(excess - maxCharge); // 剩余无法充电的部分 → 弃光
  } else if (netLoad > 0) {
    // 负荷不足 → 放电
    const dischargeCapacityEnergy = (state.soc - params.bess.socMin) * bessCapacity;
    const dischargeCapacityPower = dischargeCapacityEnergy / stepH * params.bess.efficiencyDischarge;
    const maxDischarge = Math.min(netLoad, dischargeCapacityPower, pcsPower);
    bessDischarge = maxDischarge;
    remainingLoad = netLoad - maxDischarge * params.bess.efficiencyDischarge;
  }

  // 4. 柴油机决策
  let dieselGen = 0;
  let dieselFuel = 0;
  let dgStart = 0;

  const dieselTriggered = state.soc <= params.bess.socDieselTrigger;
  const dieselStop = state.soc >= params.bess.socDieselStop;

  if (remainingLoad > 0) {
    if (!state.prevDGOn && dieselTriggered && prof.gridAvailable) {
      // 电网可用时，柴油触发但由电网承担
      // 不启动柴油机
    } else if (state.prevDGOn && dieselStop) {
      // 柴油机关停
      dieselGen = 0;
    } else if (state.prevDGOn || (!prof.gridAvailable && remainingLoad > 0)) {
      // 柴油机已运行 或 电网不可用
      if (state.prevDGOn || prof.gridAvailable === false) {
        dieselGen = Math.min(remainingLoad, dgRatedPower);
        // 低于最低稳定功率则用最低稳定功率，多余给电池充电
        if (dieselGen < dgMinStable && dieselGen > 0) {
          // 简化：低于最低稳定则设为最低
          const gap = dgMinStable - dieselGen;
          dieselGen = dgMinStable;
          // 多余功率可充电池
          const socRoom = (params.bess.socMax - state.soc) * bessCapacity / stepH;
          const extraCharge = Math.min(gap, socRoom, pcsPower - bessCharge);
          bessCharge += extraCharge;
        }
        dieselFuel = dieselGen / dgEfficiency * stepH; // L
        if (!state.prevDGOn && dieselGen > 0) {
          dgStart = 1;
        }
        remainingLoad -= dieselGen;
      }
    }
  }

  // 5. 电网购电
  let gridImport = 0;
  let excessDemand = 0;

  if (remainingLoad > 0 && prof.gridAvailable) {
    gridImport = remainingLoad;
    // 超需判断
    if (gridImport > params.grid.contractDemand_kW * (1 + params.grid.excessDemandTolerance)) {
      excessDemand = gridImport - params.grid.contractDemand_kW;
    }
  }

  // 6. 弃光/未供电
  let curtailment = 0;
  let unserved = 0;

  if (netLoad < 0) {
    // 光伏余量中无法充电也无法上网的部分
    curtailment = Math.max(0, pvExcess - bessCharge / params.bess.efficiencyCharge);
  }
  if (remainingLoad > 0 && !prof.gridAvailable && dieselGen === 0) {
    unserved = remainingLoad;
  }

  // 7. SOC 更新
  const socDelta = (bessCharge * params.bess.efficiencyCharge - bessDischarge / params.bess.efficiencyDischarge) * stepH / bessCapacity;
  let socEnd = state.soc + socDelta;
  socEnd = Math.max(params.bess.socMin, Math.min(params.bess.socMax, socEnd));

  // 可充功率（供调试用）
  const chargeable = pcsPower; // 简化

  return {
    pvGen,
    netLoad,
    pvExcess,
    chargeable,
    bessCharge,
    bessDischarge,
    dieselGen,
    dieselFuel,
    gridImport,
    curtailment,
    unserved,
    socEnd,
    dgStart,
  };
}

// ─── 汇总计算 ───────────────────────────────────────────────

function computeMonthTotals(
  intervals: DispatchInterval[],
  days: number,
  stepH: number
) {
  let pv = 0, load = 0, grid = 0, diesel_kWh = 0, dieselL = 0;
  let curtail = 0, bessC = 0, bessD = 0, unserved = 0;

  for (const it of intervals) {
    pv += it.pvGen * stepH;
    // load 从 netLoad+pvGen 反推
    const loadKW = it.netLoad + it.pvGen;
    load += (loadKW > 0 ? loadKW : it.pvGen - it.pvExcess) * stepH;
    grid += it.gridImport * stepH;
    diesel_kWh += it.dieselGen * stepH;
    dieselL += it.dieselFuel;
    curtail += it.curtailment * stepH;
    bessC += it.bessCharge * stepH;
    bessD += it.bessDischarge * stepH;
    unserved += it.unserved * stepH;
  }

  return {
    pv_kWh: pv * days,
    load_kWh: load * days,
    grid_kWh: grid * days,
    diesel_kWh: diesel_kWh * days,
    dieselFuel_L: dieselL * days,
    curtailment_kWh: curtail * days,
    bessCharge_kWh: bessC * days,
    bessDischarge_kWh: bessD * days,
    unserved_kWh: unserved * days,
  };
}

function computeAnnualSummary(
  params: InputParams,
  scenario: ScenarioConfig,
  monthlyResults: EngineMonthResult[]
): EngineAnnualSummary {
  let pv = 0, load = 0, grid = 0, dieselL = 0, curtail = 0;
  let bessCycles = 0, peakDemand = 0, totalSoc = 0, socCount = 0;

  // 电网成本
  let gridCost = 0, dieselCost = 0, demandChargeCost = 0;

  for (const mr of monthlyResults) {
    pv += mr.totals.pv_kWh;
    load += mr.totals.load_kWh;
    grid += mr.totals.grid_kWh;
    dieselL += mr.totals.dieselFuel_L;
    curtail += mr.totals.curtailment_kWh;

    // BESS 循环次数（放电量 / 容量）
    bessCycles += mr.totals.bessDischarge_kWh / scenario.bessCapacity_kWh;

    // 峰值需量
    for (const it of mr.intervals) {
      peakDemand = Math.max(peakDemand, it.gridImport);
      totalSoc += it.socEnd;
      socCount++;
    }

    // 电网成本 = 购电量 × 均价
    let totalGridCost = 0;
    for (const it of mr.intervals) {
      const price = mr.month === monthOfInterval(it, mr.month) ? 0 : 0;
      // use grid price from profile
    }
    // 简化：用平均电价
    const avgPrice = params.grid.tariffType === 'flat'
      ? params.grid.flatPrice_perkWh
      : (params.grid.offPeakPrice_perkWh * 0.7 + params.grid.peakPrice_perkWh * 0.3);

    gridCost += mr.totals.grid_kWh * avgPrice;
    dieselCost += (mr.totals.dieselFuel_L || 0) * params.diesel.fuelPrice_perL;
  }

  // 需量费
  demandChargeCost = params.grid.contractDemand_kW * params.grid.demandCharge_perKW * 12;

  return {
    pv_kWh: pv,
    load_kWh: load,
    gridImport_kWh: grid,
    dieselFuel_L: dieselL,
    curtailment_kWh: curtail,
    bessCycles,
    peakDemand_kW: peakDemand,
    avgSoc: socCount > 0 ? totalSoc / socCount : 0,
    gridCost,
    dieselCost,
    demandChargeCost,
    totalEnergyCost: gridCost + dieselCost + demandChargeCost,
  };
}

function monthOfInterval(_it: DispatchInterval, month: number): number {
  return month;
}

// ─── 基准场景计算 ───────────────────────────────────────────

/** 计算纯电网基准场景（无光储） */
export function computeBaseline(
  params: InputParams,
  profile: ProfileData
): BaselineOutput {
  let totalGrid_kWh = 0;
  let totalDiesel_L = 0;
  let peakDemand = 0;
  let totalGridCost = 0;
  let totalDieselCost = 0;

  for (let m = 0; m < 12; m++) {
    const monthProfile = profile[m];
    if (!monthProfile || monthProfile.length === 0) continue;
    const days = DAYS_PER_MONTH[m];
    const stepH = params.timeStep;

    let monthGrid_kWh = 0;
    let monthDiesel_L = 0;
    let monthGridCost = 0;

    for (const prof of monthProfile) {
      const load = prof.load_kW;

      if (prof.gridAvailable) {
        monthGrid_kWh += load * stepH;
        peakDemand = Math.max(peakDemand, load);
        monthGridCost += load * stepH * prof.gridPrice;
      } else {
        // 电网不可用时用柴油机
        const dieselPower = Math.min(load, params.diesel.ratedPower_kW);
        const fuel = dieselPower / params.diesel.efficiency_kWhPerL * stepH;
        monthDiesel_L += fuel;
        peakDemand = Math.max(peakDemand, 0);
      }
    }

    totalGrid_kWh += monthGrid_kWh * days;
    totalDiesel_L += monthDiesel_L * days;
    totalGridCost += monthGridCost * days;
    totalDieselCost += monthDiesel_L * days * params.diesel.fuelPrice_perL;
  }

  const demandChargeCost = params.grid.contractDemand_kW * params.grid.demandCharge_perKW * 12;

  return {
    annualGridCost: totalGridCost,
    annualDieselCost: totalDieselCost,
    annualDemandCharge: demandChargeCost,
    annualTotalCost: totalGridCost + totalDieselCost + demandChargeCost,
    gridImport_kWh: totalGrid_kWh,
    dieselFuel_L: totalDiesel_L,
    peakDemand_kW: peakDemand,
  };
}

/** 计算所有方案的仿真和基准 */
export function runAllSimulations(
  params: InputParams,
  scenarios: ScenarioConfig[],
  profile: ProfileData
): { scenarioResults: EngineScenarioResult[]; baselines: BaselineOutput[] } {
  const baseline = computeBaseline(params, profile);
  const scenarioResults = scenarios.map(s => runScenarioSimulation(params, s, profile));

  return {
    scenarioResults,
    baselines: scenarios.map(() => baseline),
  };
}
