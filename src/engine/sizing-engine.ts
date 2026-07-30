/**
 * 定容寻优引擎
 * 
 * 给定光伏容量，以 200kWh 为步长扫描储能容量，
 * 分别以最短回收期(PBP)和最大净现值(NPV)为目标找最优方案。
 * 额外增加 PCS=3倍负载功率的档位。
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
  isSpecial?: boolean;
}

export interface SizingResult {
  records: SizingRecord[];
  bestPBP: SizingRecord | null;
  bestNPV: SizingRecord | null;
  specialPCS: SizingRecord | null;
}

/**
 * 执行定容寻优扫描
 * @param params - 输入参数
 * @param pvCapacity - 光伏容量 kWp
 * @param bessRange - [min, max] 储能容量范围 kWh
 * @param step - 扫描步长 kWh (默认 200)
 * @param profile - 负荷/光伏 Profile
 * @param maxLoad - 最大负荷 kW (用于 PCS=3×负载)
 */
export function runSizingOptimization(
  params: InputParams,
  pvCapacity: number,
  bessRange: [number, number],
  profile: ProfileData,
  maxLoad: number,
  step: number = 200
): SizingResult {
  const records: SizingRecord[] = [];
  const baseline = computeBaseline(params, profile);

  // 更新光伏容量
  const sizingParams = { ...params, pv: { ...params.pv, capacity_kWp: pvCapacity } };

  // 逐档扫描
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

  // PCS=3×负载的特殊档位
  const specialPCS = maxLoad * 3;
  const specialBess = specialPCS / sizingParams.bess.cRate; // 保持 0.5C
  const specialScenario: ScenarioConfig = {
    id: 999,
    name: `PCS=3×Load (${specialBess}kWh)`,
    pvCapacity_kWp: pvCapacity,
    bessCapacity_kWh: Math.round(specialBess),
    pcsPower_kW: specialPCS,
  };

  const specialSim = runScenarioSimulation(sizingParams, specialScenario, profile);
  const specialFinance = computeFinance(sizingParams, specialScenario, specialSim, baseline);

  const specialRecord: SizingRecord = {
    bessCapacity_kWh: Math.round(specialBess),
    pcsPower_kW: specialPCS,
    scenario: specialScenario,
    simResult: specialSim,
    finance: {
      capex: specialFinance.capex,
      npv: specialFinance.npv,
      irr: specialFinance.irr,
      paybackStatic: specialFinance.paybackStatic,
      paybackDynamic: specialFinance.paybackDynamic,
      annualRevenue: specialFinance.annualRevenue,
    },
    isSpecial: true,
  };

  // 找最优
  const allRecords = [...records, specialRecord];
  const bestPBP = allRecords.reduce((a, b) =>
    a.finance.paybackStatic < b.finance.paybackStatic ? a : b
  );
  const bestNPV = allRecords.reduce((a, b) =>
    a.finance.npv > b.finance.npv ? a : b
  );

  return { records, bestPBP, bestNPV, specialPCS: specialRecord };
}
