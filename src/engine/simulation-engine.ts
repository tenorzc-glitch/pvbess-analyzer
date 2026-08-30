/**
 * 调度仿真引擎
 *
 * 核心逻辑：15 分钟步长 × 12 典型月日
 * 光伏优先供负荷 → 余量充电池 → 弃光
 * 负荷不足 ← 电池放电 ← 电网购电 ← 柴油机（最后手段）
 *
 * 批次4 重构：
 * - 停电双变体模型：正常工作日 / 停电工作日（窗口内 gridAvailable=false，油机+储能备电）；
 * - E3 分时计价：购电费用逐时段按 profile.gridPrice 累计（TOU 精确）
 * - 需量费月度口径：合同需量×费率 + 超需部分×惩罚费率（超需容忍 5%）
 * - E8 量纲修复：未供电量以"小时"计（unservedHours）
 * - 柴油机简化为纯停电备用：仅电网不可用时兜底，电网恢复即停（去除离网型滞回逻辑）
 *
 * 批次 R1 重构（报告修改建议 8 条）：
 * - 停运日第三变体：停运 = 光储系统停机（PV=0、BESS 不可用），工厂并未停产——
 *   负荷按"当月平均负荷×stoppageLoadFactor"平坦化，由电网/柴油供电（基线同口径）
 * - 谷充峰放套利（enablePeakArbitrage）：非峰时段储能不放电（留峰），谷价时段电网充电，
 *   需量保护：电网充电后该时段 gridImport 不超过 合同需量×0.95
 * - 放电效率口径统一：bessDischarge = AC 交付功率（效率仅计一次，修复双计）
 * - 节省分解字段：pvSelfUse / discharge / gridCharge 逐时段计价（仅电网可用时段替代市电）
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

/** 解析时段表得到某时刻电价（tariffSegments 非空时生效；无匹配则回落 profile 原价） */
export function resolveTariffPrice(
  params: InputParams,
  hourFloat: number,
  fallbackPrice: number
): number {
  const segs = params.grid.tariffSegments;
  if (!segs || segs.length === 0) return fallbackPrice;
  for (const seg of segs) {
    const [sh, sm] = (seg.start || '00:00').split(':').map(Number);
    const [eh, em] = (seg.end || '24:00').split(':').map(Number);
    const startH = sh + (sm || 0) / 60;
    let endH = eh + (em || 0) / 60;
    if (endH <= startH) endH += 24; // 跨午夜
    const h = hourFloat < startH && endH > 24 ? hourFloat + 24 : hourFloat;
    if (h >= startH && h < endH) return seg.price;
  }
  return fallbackPrice;
}

/** 按 tariffSegments 重写 profile 各时段电价（返回新 profile，不改原对象） */
export function applyTariffSegments(params: InputParams, profile: ProfileData): ProfileData {
  const segs = params.grid.tariffSegments;
  if (!segs || segs.length === 0) return profile;
  return profile.map((month) =>
    month.map((iv, slot) => ({
      ...iv,
      gridPrice: resolveTariffPrice(params, slot * params.timeStep, iv.gridPrice),
    }))
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

/**
 * 生成停运日 profile：光储系统停机（pvPerUnit=0），工厂不停产——
 * 负荷平坦化为"当月平均负荷×factor"，由电网（或柴油）供电
 */
function buildStoppageProfile(
  monthProfile: ProfileInterval[],
  factor: number
): ProfileInterval[] {
  const avgLoad = monthProfile.reduce((s, p) => s + p.load_kW, 0) / monthProfile.length;
  const flatLoad = avgLoad * factor;
  return monthProfile.map((p) => ({ ...p, pvPerUnit: 0, load_kW: flatLoad }));
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
    const monthProfile = applyTariffSegments(params, [profile[m]])[0];
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

/** 运行单月调度仿真（三变体：正常工作日 / 停电工作日 / 停运日=光储停机+工厂低负荷平坦运行） */
function runMonthlySimulation(
  params: InputParams,
  scenario: ScenarioConfig,
  monthProfile: ProfileInterval[],
  month: number
): EngineMonthResult {
  const days = DAYS_PER_MONTH[month - 1];
  // 光储有效工作天数；停运日（检修/雨季）= 光储系统停机，工厂未停产——
  // 负荷按"月均负荷×stoppageLoadFactor"平坦化，由电网/柴油供电
  const workDays = effectiveWorkDays(params, month);
  const stoppageDays = Math.max(days - workDays, 0);

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
    pvSelfUse_kWh: 0, pvSelfUseValue: 0, dischargeValue: 0,
    gridCharge_kWh: 0, gridChargeCost: 0, feedIn_kWh: 0,
  };

  const accumulate = (dayIntervals: DispatchInterval[], mult: number) => {
    if (mult <= 0) return;
    const t = sumDayIntervals(dayIntervals, stepH, params, scenario.bessCapacity_kWh);
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
    totals.pvSelfUse_kWh += t.pvSelfUse_kWh * mult;
    totals.pvSelfUseValue += t.pvSelfUseValue * mult;
    totals.dischargeValue += t.dischargeValue * mult;
    totals.gridCharge_kWh += t.gridCharge_kWh * mult;
    totals.gridChargeCost += t.gridChargeCost * mult;
    totals.feedIn_kWh += t.feedIn_kWh * mult;
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

  // 变体3：停运日（光储停机：BESS=0/PCS=0、PV 无出力；工厂低负荷平坦运行，电网/柴油供电）
  if (stoppageDays > 0) {
    const stoppageProfile = buildStoppageProfile(monthProfile, params.workDays?.stoppageLoadFactor ?? 0.1);
    const stoppageIntervals = runDayDispatch(
      params, stoppageProfile,
      0, 0, scenario.pvCapacity_kWp
    );
    accumulate(stoppageIntervals, stoppageDays);
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

  // 3. 储能充放电（bessCharge/bessDischarge 均为 AC 侧功率：充电×ηc 进电池，放电即交付）
  let bessCharge = 0;
  let bessDischarge = 0;
  const gridCharge = 0; // 逐槽电网充电恒为 0：日级 SOC 重置模型下，谷价电网充电以"日末恢复充电"稳态口径计入日汇总
  let remainingLoad = netLoad;

  // 谷充峰放套利判定：仅 TOU 且峰谷存在价差时启用
  const arbitrageOn = !!params.grid.enablePeakArbitrage
    && params.grid.peakPrice_perkWh > params.grid.offPeakPrice_perkWh * 1.001;
  const isPeakPrice = prof.gridPrice >= params.grid.peakPrice_perkWh * 0.999;
  // 非峰放电阈值：仅在净负荷超过"合同需量×0.5"时放电压峰（需量管理），
  // 其余非峰时段保留电量到峰段（谷充峰放）；停电窗口内不受限（备电优先）
  const demandThreshold = params.grid.contractDemand_kW * 0.5;
  let dischargeTarget = 0; // 放电后剩余的净负荷目标（默认全放）
  if (arbitrageOn && prof.gridAvailable && !isPeakPrice) {
    dischargeTarget = Math.min(netLoad, demandThreshold);
  }

  if (netLoad < 0) {
    // 光伏余量 → 充电
    const excess = -netLoad;
    // 可充容量 (kWh → AC kW，除以效率)
    const chargeCapacityEnergy = (params.bess.socMax - state.soc) * bessCapacity;
    const chargeCapacityPower = chargeCapacityEnergy / (stepH * params.bess.efficiencyCharge);
    const maxCharge = Math.min(excess, chargeCapacityPower, pcsPower);
    bessCharge = maxCharge;
    remainingLoad = -(excess - maxCharge); // 剩余无法充电的部分 → 弃光
  } else if (netLoad > 0 && bessCapacity > 0 && netLoad > dischargeTarget) {
    // 负荷不足 → 放电（AC 交付口径：效率仅在此处计一次；套利模式非峰仅放至压需量阈值）
    const dischargeCapacityEnergy = (state.soc - params.bess.socMin) * bessCapacity;
    const dischargeCapacityPower = dischargeCapacityEnergy / stepH * params.bess.efficiencyDischarge;
    const maxDischarge = Math.min(netLoad - dischargeTarget, dischargeCapacityPower, pcsPower);
    bessDischarge = maxDischarge;
    remainingLoad = netLoad - maxDischarge;
  }

  // 4. 柴油机决策（并网场景：仅停电窗口内的最后手段；电网恢复即停）
  let dieselGen = 0;
  let dieselFuel = 0;
  let dgStart = 0;

  if (remainingLoad > 0 && !prof.gridAvailable) {
    // 电网不可用且储能已尽力 → 柴油机兜底
    dieselGen = Math.min(remainingLoad, dgRatedPower);
    // 低于最低稳定功率则按最低稳定功率运行，多余给电池充电
    if (dieselGen < dgMinStable && dieselGen > 0 && bessCapacity > 0) {
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

  // 5. 电网购电（含谷价套利的电网充电功率）
  let gridImport = 0;

  if (prof.gridAvailable) {
    gridImport = Math.max(0, remainingLoad) + gridCharge;
  }

  // 6. 弃光/未供电
  let curtailment = 0;
  let unserved = 0;

  if (netLoad < 0) {
    // 光伏余量中无法充电也无法上网的部分（PV 充电 = 总充电 − 电网充电；柴油富余充电与 PV 余量互斥）
    const pvCharge = Math.max(0, bessCharge - gridCharge);
    curtailment = Math.max(0, pvExcess - pvCharge);
  }
  if (remainingLoad > 0 && !prof.gridAvailable) {
    // 电网不可用且储能+油机无法覆盖的部分 → 未供电（E8：量纲为功率，汇总时×步长得电量、按时段计小时）
    unserved = remainingLoad;
  }

  // 7. SOC 更新（停运日变体 bessCapacity=0 时保持原 SOC）
  let socEnd = state.soc;
  if (bessCapacity > 0) {
    const socDelta = (bessCharge * params.bess.efficiencyCharge - bessDischarge / params.bess.efficiencyDischarge) * stepH / bessCapacity;
    socEnd = state.soc + socDelta;
    socEnd = Math.max(params.bess.socMin, Math.min(params.bess.socMax, socEnd));
  }

  // 可充功率（供调试用）
  const chargeable = pcsPower; // 简化

  // 馈网上网（开关开启时：弃光转为上网电量，逐时段按 feedInPrice 计价）
  const feedIn = params.grid.feedInEnabled ? curtailment : 0;
  const finalCurtailment = curtailment - feedIn;

  return {
    pvGen,
    netLoad,
    pvExcess,
    chargeable,
    bessCharge,
    bessDischarge,
    gridCharge,
    dieselGen,
    dieselFuel,
    gridImport,
    curtailment: finalCurtailment,
    feedIn,
    unserved,
    socEnd,
    dgStart,
    gridPrice: prof.gridPrice,
    gridAvailable: prof.gridAvailable,
  };
}

// ─── 汇总计算 ───────────────────────────────────────────────

/**
 * 汇总单日逐时段结果（E3：购电费用逐时段 × 该时段电价；分解口径：PV自用/放电价值仅在电网可用时段替代市电）
 *
 * 日末恢复充电（谷价电网充电的稳态口径）：引擎按典型日仿真、每日 SOC 重置为 socInitial，
 * 当日净消耗的 SOC 视为夜间谷价充电补回——gridCharge = max(0, socInitial−日末SOC)×容量/ηc，
 * 按谷电价计入 gridCost。该功率（摊到夜间谷段）远低于需量保护线，不计入月峰。
 */
function sumDayIntervals(
  intervals: DispatchInterval[],
  stepH: number,
  params: InputParams,
  bessCapacity: number
) {
  let pv = 0, load = 0, grid = 0, diesel_kWh = 0, dieselL = 0;
  let curtail = 0, bessC = 0, bessD = 0, unserved = 0, feedInKwh = 0;
  let gridCost = 0, peakGrid = 0, unservedH = 0;
  let pvSelfUse = 0, pvSelfUseValue = 0, dischargeValue = 0;
  let gridChargeKwh = 0, gridChargeCost = 0;

  for (const it of intervals) {
    pv += it.pvGen * stepH;
    // load 从 netLoad+pvGen 反推
    const loadKW = it.netLoad + it.pvGen;
    load += (loadKW > 0 ? loadKW : it.pvGen - it.pvExcess) * stepH;
    grid += it.gridImport * stepH;
    gridCost += it.gridImport * stepH * it.gridPrice; // E3 分时计价
    peakGrid = Math.max(peakGrid, it.gridImport);     // 需量费依据（仅电网侧，含电网充电）
    diesel_kWh += it.dieselGen * stepH;
    dieselL += it.dieselFuel;
    curtail += it.curtailment * stepH;
    feedInKwh += (it.feedIn || 0) * stepH;
    bessC += it.bessCharge * stepH;
    bessD += it.bessDischarge * stepH;
    unserved += it.unserved * stepH;
    if (it.unserved > 0) unservedH += stepH;          // E8 量纲：小时

    // 节省分解（仅电网可用时段：停电窗口内的 PV/放电替代的是柴油，归入柴油差口径）
    if (it.gridAvailable) {
      const selfUseKW = Math.min(it.pvGen, Math.max(loadKW, 0));
      pvSelfUse += selfUseKW * stepH;
      pvSelfUseValue += selfUseKW * stepH * it.gridPrice;
      dischargeValue += it.bessDischarge * stepH * it.gridPrice;
      gridChargeKwh += it.gridCharge * stepH;
      gridChargeCost += it.gridCharge * stepH * it.gridPrice;
    }
  }

  // 日末恢复充电：当日 SOC 净消耗由夜间谷价电网充电补回（稳态口径）
  if (bessCapacity > 0 && params.grid.enablePeakArbitrage && intervals.length > 0) {
    const dayEndSoc = intervals[intervals.length - 1].socEnd;
    const restoreSoc = Math.max(0, params.bess.socInitial - dayEndSoc);
    if (restoreSoc > 0) {
      const restoreKwh = restoreSoc * bessCapacity / params.bess.efficiencyCharge;
      const restoreCost = restoreKwh * params.grid.offPeakPrice_perkWh;
      grid += restoreKwh;
      gridCost += restoreCost;
      gridChargeKwh += restoreKwh;
      gridChargeCost += restoreCost;
    }
  }

  return {
    pv_kWh: pv,
    load_kWh: load,
    grid_kWh: grid,
    diesel_kWh: diesel_kWh,
    dieselFuel_L: dieselL,
    curtailment_kWh: curtail,
    feedIn_kWh: feedInKwh,
    bessCharge_kWh: bessC,
    bessDischarge_kWh: bessD,
    unserved_kWh: unserved,
    gridCost,
    peakGrid_kW: peakGrid,
    unservedHours: unservedH,
    pvSelfUse_kWh: pvSelfUse,
    pvSelfUseValue,
    dischargeValue,
    gridCharge_kWh: gridChargeKwh,
    gridChargeCost,
  };
}

function computeAnnualSummary(
  params: InputParams,
  scenario: ScenarioConfig,
  monthlyResults: EngineMonthResult[]
): EngineAnnualSummary {
  let pv = 0, load = 0, grid = 0, dieselL = 0, curtail = 0, feedInKwh = 0;
  let bessCycles = 0, peakDemand = 0, totalSoc = 0, socCount = 0;
  let unservedHours = 0;
  let pvSelfUse = 0, pvSelfUseValue = 0, dischargeValue = 0;
  let gridChargeKwh = 0, gridChargeCost = 0;

  // 电网成本（E3：直接累加月度分时计价结果）
  let gridCost = 0, dieselCost = 0, demandChargeCost = 0;

  for (const mr of monthlyResults) {
    pv += mr.totals.pv_kWh;
    load += mr.totals.load_kWh;
    grid += mr.totals.grid_kWh;
    dieselL += mr.totals.dieselFuel_L;
    curtail += mr.totals.curtailment_kWh;
    feedInKwh += mr.totals.feedIn_kWh || 0;
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

    pvSelfUse += mr.totals.pvSelfUse_kWh || 0;
    pvSelfUseValue += mr.totals.pvSelfUseValue || 0;
    dischargeValue += mr.totals.dischargeValue || 0;
    gridChargeKwh += mr.totals.gridCharge_kWh || 0;
    gridChargeCost += mr.totals.gridChargeCost || 0;
  }

  return {
    pv_kWh: pv,
    load_kWh: load,
    gridImport_kWh: grid,
    dieselFuel_L: dieselL,
    curtailment_kWh: curtail,
    feedIn_kWh: feedInKwh,
    bessCycles,
    peakDemand_kW: peakDemand,
    avgSoc: socCount > 0 ? totalSoc / socCount : 0,
    gridCost,
    dieselCost,
    demandChargeCost,
    totalEnergyCost: gridCost + dieselCost + demandChargeCost,
    unservedHours,
    pvSelfUse_kWh: pvSelfUse,
    pvSelfUseValue,
    dischargeValue,
    gridCharge_kWh: gridChargeKwh,
    gridChargeCost,
  };
}

// ─── 基准场景计算 ───────────────────────────────────────────

/**
 * 计算纯电网基准场景（无光储）
 * 与场景侧同口径：停电工作日窗口内由柴油机备电（年停电时长 = Σ 停电日×时长），
 * 停运日 = 工厂低负荷平坦运行（月均负荷×stoppageLoadFactor）由电网供电，
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
  const monthlyPeaks: number[] = [];

  const stepH = params.timeStep;
  const outageCfg = params.grid.outage;
  const outageSlots = Math.max(1, Math.ceil((outageCfg?.eventMinutes || 30) / (stepH * 60)));
  const outageStart = parseOutageWindow(outageCfg?.windowStart || '17:30', stepH);

  for (let m = 0; m < 12; m++) {
    const monthProfile = applyTariffSegments(params, [profile[m]])[0];
    if (!monthProfile || monthProfile.length === 0) continue;
    // 基准与场景侧同口径：停运日低负荷平坦运行（电网供电）；停电工作日窗口内油机备电
    const days = DAYS_PER_MONTH[m];
    const workDays = effectiveWorkDays(params, m + 1);
    const stoppageDays = Math.max(days - workDays, 0);
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

    // 停运日：低负荷平坦（月均负荷×系数），全天电网供电（分时计价）
    let sGrid = 0, sCost = 0, sPeak = 0;
    if (stoppageDays > 0) {
      const stoppageProfile = buildStoppageProfile(monthProfile, params.workDays?.stoppageLoadFactor ?? 0.1);
      for (const prof of stoppageProfile) {
        sGrid += prof.load_kW * stepH;
        sCost += prof.load_kW * stepH * prof.gridPrice;
        sPeak = Math.max(sPeak, prof.load_kW);
      }
    }

    const monthPeak = Math.max(dayPeak, oPeak, sPeak);
    peakDemand = Math.max(peakDemand, monthPeak);
    monthlyPeaks.push(monthPeak);

    totalGrid_kWh += dayGrid * normalDays + oGrid * outageDays + sGrid * stoppageDays;
    totalGridCost += dayCost * normalDays + oCost * outageDays + sCost * stoppageDays;
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
    monthlyPeaks_kW: monthlyPeaks,
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
