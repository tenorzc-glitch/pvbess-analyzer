/**
 * 调度仿真引擎
 *
 * 核心逻辑：15 分钟步长 × 12 典型月日
 * 光伏优先供负荷 → 余量充电池 → 弃光
 * 负荷不足 ← 电池放电 ← 电网购电 ← 柴油机（最后手段）
 *
 * 批次4 重构：
 * - 停电双变体模型：正常工作日 / 停电工作日（窗口内 gridAvailable=false，油机+储能备电）；
 *   停运日（检修/雨季）全厂停产，负荷归零不计（灌溉场景物理意义：雨天不泵水）
 * - E3 分时计价：购电费用逐时段按 profile.gridPrice 累计（TOU 精确）
 * - 需量费月度口径：合同需量×费率 + 超需部分×惩罚费率（超需容忍 5%）
 * - E8 量纲修复：未供电量以"小时"计（unservedHours）
 * - 柴油机简化为纯停电备用：仅电网不可用时兜底，电网恢复即停（去除离网型滞回逻辑）
 */

import { InputParams, ScenarioConfig, ProfileData, ProfileInterval } from '../types';
import {
  SimulationInput, DispatchState, DispatchInterval,
  EngineMonthResult, EngineScenarioResult, EngineAnnualSummary, BaselineOutput
} from './types';

/** 每月天数 */
const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** 计算某月光储有效工作天数 = 当月天数 - 月检修天数 - 雨季停运天数（若该月为雨季） */
export function effectiveWorkDays(params: InputParams, month: number): number {
  const base = DAYS_PER_MONTH[month - 1];
  const wd = params.workDays;
  if (!wd) return base;
  const maintenance = wd.maintenanceDaysPerMonth?.[month - 1] || 0;
  const rainyIdx = wd.rainyMonths?.indexOf(month) ?? -1;
  const rainyOutage = rainyIdx >= 0 ? (wd.rainyOutageDays?.[rainyIdx] || 0) : 0;
  return Math.max(base - maintenance - rainyOutage, 0);
}

/** 解析停电窗口起始时刻 'HH:MM' → 时段索引 */
export function parseOutageWindow(windowStart: string, stepH: number): number {
  const parts = (windowStart || '17:30').split(':');
  const hh = Number(parts[0]) || 0;
  const mm = Number(parts[1]) || 0;
  return Math.min(
    Math.floor((hh * 60 + mm) / (stepH * 60)),
    Math.round(24 / stepH) - 1
  );
}

/** 生成停电日 profile：窗口内时段 gridAvailable=false（不改动原 profile） */
function buildOutageProfile(
  monthProfile: ProfileInterval[],
  startSlot: number,
  slots: number
): ProfileInterval[] {
  return monthProfile.map((p, i) =>
    i >= startSlot && i < startSlot + slots ? { ...p, gridAvailable: false } : p
  );
}

/** 月度需量费 = 合同需量×需量费率 + 超需部分×惩罚费率（容忍度内不罚） */
export function monthlyDemandCharge(params: InputParams, monthPeakGrid_kW: number): number {
  const contract = params.grid.contractDemand_kW;
  const allowed = contract * (1 + (params.grid.excessDemandTolerance ?? 0));
  const excess = Math.max(0, monthPeakGrid_kW - allowed);
  return contract * params.grid.demandCharge_perKW + excess * params.grid.excessDemandRate;
}

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

/** 运行一整日（96 时段）调度，返回逐时段结果 */
function runDayDispatch(
  params: InputParams,
  dayProfile: ProfileInterval[],
  bessCapacity: number,
  pcsPower: number,
  pvCapacity: number
): DispatchInterval[] {
  const intervals: DispatchInterval[] = [];
  let state: DispatchState = { soc: params.bess.socInitial, prevDGOn: false };
  const stepH = params.timeStep;

  for (let t = 0; t < dayProfile.length; t++) {
    const result = dispatchInterval(
      params, dayProfile[t], state, stepH,
      bessCapacity, pcsPower, pvCapacity
    );
    intervals.push(result);
    state = { soc: result.socEnd, prevDGOn: result.dieselGen > 0 };
  }
  return intervals;
}

/** 运行单月调度仿真（双变体：正常工作日 / 停电工作日；停运日全厂停产不计） */
function runMonthlySimulation(
  params: InputParams,
  scenario: ScenarioConfig,
  monthProfile: ProfileInterval[],
  month: number
): EngineMonthResult {
  const days = DAYS_PER_MONTH[month - 1];
  // 光储有效工作天数；停运日（检修/雨季）全厂停产——负荷归零，
  // 既不发电也不耗电（灌溉场景：雨天不泵水、检修日不生产）
  const workDays = effectiveWorkDays(params, month);

  // 停电变体参数：每月停电工作日数（不超过有效工作日），窗口内电网不可用
  const outageCfg = params.grid.outage;
  const outageDays = Math.min(outageCfg?.eventDaysPerMonth?.[month - 1] || 0, workDays);
  const normalDays = Math.max(workDays - outageDays, 0);
  const stepH = params.timeStep;
  const outageSlots = Math.max(1, Math.ceil((outageCfg?.eventMinutes || 30) / (stepH * 60)));
  const outageStart = parseOutageWindow(outageCfg?.windowStart || '17:30', stepH);

  const totals = {
    pv_kWh: 0, load_kWh: 0, grid_kWh: 0, diesel_kWh: 0, dieselFuel_L: 0,
    curtailment_kWh: 0, bessCharge_kWh: 0, bessDischarge_kWh: 0, unserved_kWh: 0,
    gridCost: 0, monthPeakGrid_kW: 0, unservedHours: 0,
  };

  const accumulate = (dayIntervals: DispatchInterval[], mult: number) => {
    if (mult <= 0) return;
    const t = sumDayIntervals(dayIntervals, stepH);
    totals.pv_kWh += t.pv_kWh * mult;
    totals.load_kWh += t.load_kWh * mult;
    totals.grid_kWh += t.grid_kWh * mult;
    totals.diesel_kWh += t.diesel_kWh * mult;
    totals.dieselFuel_L += t.dieselFuel_L * mult;
    totals.curtailment_kWh += t.curtailment_kWh * mult;
    totals.bessCharge_kWh += t.bessCharge_kWh * mult;
    totals.bessDischarge_kWh += t.bessDischarge_kWh * mult;
    totals.unserved_kWh += t.unserved_kWh * mult;
    totals.gridCost += t.gridCost * mult;
    totals.unservedHours += t.unservedHours * mult;
    totals.monthPeakGrid_kW = Math.max(totals.monthPeakGrid_kW, t.peakGrid_kW);
  };

  // 变体1：正常工作日（光储正常运行）
  const normalIntervals = runDayDispatch(
    params, monthProfile,
    scenario.bessCapacity_kWh, scenario.pcsPower_kW, scenario.pvCapacity_kWp
  );
  accumulate(normalIntervals, normalDays);

  // 变体2：停电工作日（窗口内电网不可用，储能+油机备电）
  if (outageDays > 0) {
    const outageProfile = buildOutageProfile(monthProfile, outageStart, outageSlots);
    const outageIntervals = runDayDispatch(
      params, outageProfile,
      scenario.bessCapacity_kWh, scenario.pcsPower_kW, scenario.pvCapacity_kWp
    );
    accumulate(outageIntervals, outageDays);
  }

  return { month, days, intervals: normalIntervals, totals };
}

/** 单个 15 分钟时段调度 */
function dispatchInterval(
  params: InputParams,
  prof: ProfileInterval,
  state: DispatchState,
  stepH: number,
  bessCapacity: number,
  pcsPower: number,
  pvCapacity: number
): DispatchInterval {
  const dgMinStable = params.diesel.minStablePower_kW;
  const dgRatedPower = params.diesel.ratedPower_kW;
  const dgEfficiency = params.diesel.efficiency_kWhPerL;

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

  // 4. 柴油机决策（并网场景：仅停电窗口内的最后手段；电网恢复即停）
  let dieselGen = 0;
  let dieselFuel = 0;
  let dgStart = 0;

  if (remainingLoad > 0 && !prof.gridAvailable) {
    // 电网不可用且储能已尽力 → 柴油机兜底
    dieselGen = Math.min(remainingLoad, dgRatedPower);
    // 低于最低稳定功率则按最低稳定功率运行，多余给电池充电
    if (dieselGen < dgMinStable && dieselGen > 0) {
      const gap = dgMinStable - dieselGen;
      dieselGen = dgMinStable;
      const socRoom = (params.bess.socMax - state.soc) * bessCapacity / stepH;
      const extraCharge = Math.min(gap, socRoom, pcsPower - bessCharge);
      bessCharge += Math.max(0, extraCharge);
    }
    dieselFuel = dieselGen / dgEfficiency * stepH; // L
    if (!state.prevDGOn && dieselGen > 0) {
      dgStart = 1;
    }
    remainingLoad -= dieselGen;
  }

  // 5. 电网购电
  let gridImport = 0;

  if (remainingLoad > 0 && prof.gridAvailable) {
    gridImport = remainingLoad;
  }

  // 6. 弃光/未供电
  let curtailment = 0;
  let unserved = 0;

  if (netLoad < 0) {
    // 光伏余量中无法充电也无法上网的部分
    curtailment = Math.max(0, pvExcess - bessCharge / params.bess.efficiencyCharge);
  }
  if (remainingLoad > 0 && !prof.gridAvailable) {
    // 电网不可用且储能+油机无法覆盖的部分 → 未供电（E8：量纲为功率，汇总时×步长得电量、按时段计小时）
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
    gridPrice: prof.gridPrice,
  };
}

// ─── 汇总计算 ───────────────────────────────────────────────

/** 汇总单日逐时段结果（E3：购电费用逐时段 × 该时段电价） */
function sumDayIntervals(intervals: DispatchInterval[], stepH: number) {
  let pv = 0, load = 0, grid = 0, diesel_kWh = 0, dieselL = 0;
  let curtail = 0, bessC = 0, bessD = 0, unserved = 0;
  let gridCost = 0, peakGrid = 0, unservedH = 0;

  for (const it of intervals) {
    pv += it.pvGen * stepH;
    // load 从 netLoad+pvGen 反推
    const loadKW = it.netLoad + it.pvGen;
    load += (loadKW > 0 ? loadKW : it.pvGen - it.pvExcess) * stepH;
    grid += it.gridImport * stepH;
    gridCost += it.gridImport * stepH * it.gridPrice; // E3 分时计价
    peakGrid = Math.max(peakGrid, it.gridImport);     // 需量费依据（仅电网侧）
    diesel_kWh += it.dieselGen * stepH;
    dieselL += it.dieselFuel;
    curtail += it.curtailment * stepH;
    bessC += it.bessCharge * stepH;
    bessD += it.bessDischarge * stepH;
    unserved += it.unserved * stepH;
    if (it.unserved > 0) unservedH += stepH;          // E8 量纲：小时
  }

  return {
    pv_kWh: pv,
    load_kWh: load,
    grid_kWh: grid,
    diesel_kWh: diesel_kWh,
    dieselFuel_L: dieselL,
    curtailment_kWh: curtail,
    bessCharge_kWh: bessC,
    bessDischarge_kWh: bessD,
    unserved_kWh: unserved,
    gridCost,
    peakGrid_kW: peakGrid,
    unservedHours: unservedH,
  };
}

function computeAnnualSummary(
  params: InputParams,
  scenario: ScenarioConfig,
  monthlyResults: EngineMonthResult[]
): EngineAnnualSummary {
  let pv = 0, load = 0, grid = 0, dieselL = 0, curtail = 0;
  let bessCycles = 0, peakDemand = 0, totalSoc = 0, socCount = 0;
  let unservedHours = 0;

  // 电网成本（E3：直接累加月度分时计价结果）
  let gridCost = 0, dieselCost = 0, demandChargeCost = 0;

  for (const mr of monthlyResults) {
    pv += mr.totals.pv_kWh;
    load += mr.totals.load_kWh;
    grid += mr.totals.grid_kWh;
    dieselL += mr.totals.dieselFuel_L;
    curtail += mr.totals.curtailment_kWh;
    unservedHours += mr.totals.unservedHours || 0;

    // BESS 循环次数（放电量 / 容量）
    bessCycles += mr.totals.bessDischarge_kWh / scenario.bessCapacity_kWh;

    // 峰值需量（月度口径，三变体已在 monthPeakGrid_kW 中考虑）
    peakDemand = Math.max(peakDemand, mr.totals.monthPeakGrid_kW || 0);

    // 平均 SOC（取正常工作日变体的逐时段序列）
    for (const it of mr.intervals) {
      totalSoc += it.socEnd;
      socCount++;
    }

    gridCost += mr.totals.gridCost || 0;
    dieselCost += (mr.totals.dieselFuel_L || 0) * params.diesel.fuelPrice_perL;
    // 需量费 = 合同需量费 + 超需惩罚（月度计）
    demandChargeCost += monthlyDemandCharge(params, mr.totals.monthPeakGrid_kW || 0);
  }

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
    unservedHours,
  };
}

// ─── 基准场景计算 ───────────────────────────────────────────

/**
 * 计算纯电网基准场景（无光储）
 * 与场景侧同口径：停电工作日窗口内由柴油机备电（年停电时长 = Σ 停电日×时长），
 * 购电按分时 TOU 计价，需量费按月度峰值计（含超需惩罚）。
 */
export function computeBaseline(
  params: InputParams,
  profile: ProfileData
): BaselineOutput {
  let totalGrid_kWh = 0;
  let totalDiesel_L = 0;
  let peakDemand = 0;
  let totalGridCost = 0;
  let totalDieselCost = 0;
  let totalDemandCharge = 0;

  const stepH = params.timeStep;
  const outageCfg = params.grid.outage;
  const outageSlots = Math.max(1, Math.ceil((outageCfg?.eventMinutes || 30) / (stepH * 60)));
  const outageStart = parseOutageWindow(outageCfg?.windowStart || '17:30', stepH);

  for (let m = 0; m < 12; m++) {
    const monthProfile = profile[m];
    if (!monthProfile || monthProfile.length === 0) continue;
    // 基准与场景侧同口径：停运日全厂停产不计；停电工作日窗口内油机备电
    const workDays = effectiveWorkDays(params, m + 1);
    const outageDays = Math.min(outageCfg?.eventDaysPerMonth?.[m] || 0, workDays);
    const normalDays = workDays - outageDays;

    // 正常日：全部电网供电（分时计价）
    let dayGrid = 0, dayCost = 0, dayPeak = 0;
    for (const prof of monthProfile) {
      dayGrid += prof.load_kW * stepH;
      dayCost += prof.load_kW * stepH * prof.gridPrice;
      dayPeak = Math.max(dayPeak, prof.load_kW);
    }

    // 停电日：窗口内柴油机备电，其余时段电网
    let oGrid = 0, oCost = 0, oDieselL = 0, oPeak = 0;
    if (outageDays > 0) {
      for (let t = 0; t < monthProfile.length; t++) {
        const prof = monthProfile[t];
        const inOutage = t >= outageStart && t < outageStart + outageSlots;
        if (inOutage) {
          const dieselPower = Math.min(prof.load_kW, params.diesel.ratedPower_kW);
          oDieselL += dieselPower / params.diesel.efficiency_kWhPerL * stepH;
        } else {
          oGrid += prof.load_kW * stepH;
          oCost += prof.load_kW * stepH * prof.gridPrice;
          oPeak = Math.max(oPeak, prof.load_kW);
        }
      }
    }

    const monthPeak = Math.max(dayPeak, oPeak);
    peakDemand = Math.max(peakDemand, monthPeak);

    totalGrid_kWh += dayGrid * normalDays + oGrid * outageDays;
    totalGridCost += dayCost * normalDays + oCost * outageDays;
    totalDiesel_L += oDieselL * outageDays;
    totalDemandCharge += monthlyDemandCharge(params, monthPeak);
  }

  totalDieselCost = totalDiesel_L * params.diesel.fuelPrice_perL;

  return {
    annualGridCost: totalGridCost,
    annualDieselCost: totalDieselCost,
    annualDemandCharge: totalDemandCharge,
    annualTotalCost: totalGridCost + totalDieselCost + totalDemandCharge,
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
