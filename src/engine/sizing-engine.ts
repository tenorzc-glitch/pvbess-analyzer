/**
 * 定容寻优引擎
 *
 * 给定光伏容量，以固定步长扫描储能容量（能量逻辑：PCS = cRate × 能量），
 * 分别以最短回收期(PBP)和最大净现值(NPV)为目标找最优方案。
 * 另设冲击负载档（功率逻辑）：PCS = 普通负载峰值 + 启动倍数×泵额定功率，
 * 功率:能量 保持 1:2；该档不参与最优 PBP/NPV 评选。
 */

import { InputParams, ScenarioConfig, ProfileData } from '../types';
import {
  runScenarioSimulation, computeBaseline
} from './simulation-engine';
import { computeFinance } from './financial-engine';
import { EngineScenarioResult, BaselineOutput } from './types';

export interface SizingRecord {
  bessCapacity_kWh: number;
  pcsPower_kW: number;
  scenario: ScenarioConfig;
  simResult: EngineScenarioResult;
  finance: {
    capex: number;
    npv: number;
    irr: number;
    paybackStatic: number;
    paybackDynamic: number;
    annualRevenue: number;
  };
  isShock?: boolean;
}

export interface SizingResult {
  records: SizingRecord[];
  bestPBP: SizingRecord | null;
  bestNPV: SizingRecord | null;
  /** 冲击负载档（功率逻辑，独立展示，不参与最优评选） */
  shockTier: SizingRecord | null;
  /** 冲击档计算依据：profile 最大负荷与扣除泵启动倍数后的普通负载峰值 */
  shockBasis: { profilePeak: number; normalPeak: number } | null;
}

/** 计算 profile 最大负荷（kW） */
export function getProfilePeakLoad(profile: ProfileData): number {
  let peak = 0;
  for (const month of profile) {
    for (const iv of month) {
      if (iv.load_kW > peak) peak = iv.load_kW;
    }
  }
  return peak;
}

/**
 * 执行定容寻优扫描
 * @param params - 输入参数
 * @param pvCapacity - 光伏容量 kWp
 * @param bessRange - [min, max] 储能容量范围 kWh
 * @param profile - 负荷/光伏 Profile
 * @param step - 扫描步长 kWh (默认 200)
 */
export function runSizingOptimization(
  params: InputParams,
  pvCapacity: number,
  bessRange: [number, number],
  profile: ProfileData,
  step: number = 200
): SizingResult {
  const records: SizingRecord[] = [];
  const baseline = computeBaseline(params, profile);

  // 更新光伏容量
  const sizingParams = { ...params, pv: { ...params.pv, capacity_kWp: pvCapacity } };

  // 逐档扫描（能量逻辑，不含冲击负载的 PCS 放大需求）
  for (let bess = bessRange[0]; bess <= bessRange[1]; bess += step) {
    if (bess === 0) continue; // 跳过 0 kWh

    const pcs = bess * sizingParams.bess.cRate; // 0.5C
    const scenario: ScenarioConfig = {
      id: bess,
      name: `${bess}kWh / ${pcs}kW`,
      pvCapacity_kWp: pvCapacity,
      bessCapacity_kWh: bess,
      pcsPower_kW: pcs,
    };

    const simResult = runScenarioSimulation(sizingParams, scenario, profile);
    const finance = computeFinance(sizingParams, scenario, simResult, baseline);

    records.push({
      bessCapacity_kWh: bess,
      pcsPower_kW: pcs,
      scenario,
      simResult,
      finance: {
        capex: finance.capex,
        npv: finance.npv,
        irr: finance.irr,
        paybackStatic: finance.paybackStatic,
        paybackDynamic: finance.paybackDynamic,
        annualRevenue: finance.annualRevenue,
      },
    });
  }

  // ─── 冲击负载档（功率逻辑）───
  // 普通负载峰值 = profile 最大负荷 − (启动倍数−1)×泵额定功率（剔除泵启动瞬间的叠加分量）
  // PCS = 普通负载峰值 + 启动倍数×泵额定功率；BESS = PCS / cRate（恒 1:2）
  const profilePeak = getProfilePeakLoad(profile);
  const pumpRated = params.load.pumpRatedPower_kW;
  const mult = params.load.pumpStartMultiplier;
  const normalPeak = Math.max(0, profilePeak - (mult - 1) * pumpRated);
  const shockPCS = Math.round(normalPeak + mult * pumpRated);
  const shockBess = Math.round(shockPCS / sizingParams.bess.cRate);

  const shockScenario: ScenarioConfig = {
    id: 6,
    name: `${shockBess}kWh / ${shockPCS}kW (Shock)`,
    pvCapacity_kWp: pvCapacity,
    bessCapacity_kWh: shockBess,
    pcsPower_kW: shockPCS,
  };

  const shockSim = runScenarioSimulation(sizingParams, shockScenario, profile);
  const shockFinance = computeFinance(sizingParams, shockScenario, shockSim, baseline);

  const shockTier: SizingRecord = {
    bessCapacity_kWh: shockBess,
    pcsPower_kW: shockPCS,
    scenario: shockScenario,
    simResult: shockSim,
    finance: {
      capex: shockFinance.capex,
      npv: shockFinance.npv,
      irr: shockFinance.irr,
      paybackStatic: shockFinance.paybackStatic,
      paybackDynamic: shockFinance.paybackDynamic,
      annualRevenue: shockFinance.annualRevenue,
    },
    isShock: true,
  };

  // 找最优（仅能量逻辑档参与，冲击档独立展示）
  // E10 修正：paybackStatic 封顶为 projectLife（表示"寿命内未回收"）。
  // 全部未回收时 reduce 全相等会误选最差档（如 3000kWh），
  // 应先过滤可回收记录；无一回收则 bestPBP = null（UI 显示"无经济可行方案"）。
  const recoverable = records.filter((r) => r.finance.paybackStatic < params.financial.projectLife);
  const bestPBP = recoverable.length > 0
    ? recoverable.reduce((a, b) => (a.finance.paybackStatic < b.finance.paybackStatic ? a : b))
    : null;
  const bestNPV = records.length > 0
    ? records.reduce((a, b) => (a.finance.npv > b.finance.npv ? a : b))
    : null;

  return { records, bestPBP, bestNPV, shockTier, shockBasis: { profilePeak, normalPeak } };
}
