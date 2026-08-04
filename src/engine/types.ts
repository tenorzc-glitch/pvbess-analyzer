/** 引擎内部使用的紧凑类型，与外部类型解耦 */

import { InputParams, ScenarioConfig, ProfileData } from '../types';

/** 仿真输入 */
export interface SimulationInput {
  params: InputParams;
  scenario: ScenarioConfig;
  profile: ProfileData;
}

/** 调度中间状态 */
export interface DispatchState {
  soc: number;           // 时段开始 SOC
  prevDGOn: boolean;     // 上一时段柴油机是否运行
}

/** 单时段调度结果（紧凑版本） */
export interface DispatchInterval {
  pvGen: number;
  netLoad: number;       // 负荷 - 光伏（负值 = 余量）
  pvExcess: number;      // 光伏余量
  chargeable: number;    // 可充功率
  bessCharge: number;    // 充电功率 AC 侧（含 PV 充电 + 电网充电 gridCharge + 柴油富余充电）
  bessDischarge: number; // 放电功率 AC 交付侧（效率已单计）
  gridCharge: number;    // 其中来自电网的充电功率（谷价套利，0 = 未发生）
  dieselGen: number;
  dieselFuel: number;    // 柴油消耗(L)
  gridImport: number;    // 电网购电功率（含 gridCharge）
  curtailment: number;
  unserved: number;
  socEnd: number;
  dgStart: number;       // 柴油机本次启动标志
  gridPrice: number;     // 该时段购电价（分时 TOU，来自 profile）
  gridAvailable: boolean; // 该时段电网是否可用（分解口径：PV自用/放电价值仅在电网可用时替代市电）
}

/** 纯电网基准输出 */
export interface BaselineOutput {
  annualGridCost: number;
  annualDieselCost: number;
  annualDemandCharge: number;
  annualTotalCost: number;
  gridImport_kWh: number;
  dieselFuel_L: number;
  peakDemand_kW: number;
  monthlyPeaks_kW: number[]; // [12] 各月电网峰值（需量差分解口径）
}

/** 仿真引擎输入（供 Worker 使用） */
export interface EngineInput {
  params: InputParams;
  scenarios: ScenarioConfig[];
  profile: ProfileData;
}

/** 仿真引擎输出 */
export interface EngineOutput {
  scenarioResults: EngineScenarioResult[];
  baselines: BaselineOutput[];
}

export interface EngineScenarioResult {
  scenarioId: number;
  monthlyResults: EngineMonthResult[];
  annual: EngineAnnualSummary;
}

export interface EngineMonthResult {
  month: number;
  days: number;
  intervals: DispatchInterval[];
  totals: {
    pv_kWh: number;
    load_kWh: number;
    grid_kWh: number;
    diesel_kWh: number;
    dieselFuel_L: number;
    curtailment_kWh: number;
    bessCharge_kWh: number;
    bessDischarge_kWh: number;
    unserved_kWh: number;
    gridCost: number;         // 当月购电费用（分时 TOU 精确计价）
    monthPeakGrid_kW: number; // 当月电网侧峰值功率（需量费依据，含三变体）
    unservedHours: number;    // 当月未供电小时数（E8 断电损失量纲）
    pvSelfUse_kWh: number;    // PV 自用电量（仅电网可用时段，替代市电口径）
    pvSelfUseValue: number;   // PV 自用价值 = Σ pvSelfUse×分时电价
    dischargeValue: number;   // 储能放电价值 = Σ bessDischarge×分时电价（仅电网可用时段）
    gridCharge_kWh: number;   // 电网充电电量（谷价套利）
    gridChargeCost: number;   // 电网充电成本 = Σ gridCharge×分时电价
  };
}

export interface EngineAnnualSummary {
  pv_kWh: number;
  load_kWh: number;
  gridImport_kWh: number;
  dieselFuel_L: number;
  curtailment_kWh: number;
  bessCycles: number;
  peakDemand_kW: number;
  avgSoc: number;
  gridCost: number;
  dieselCost: number;
  demandChargeCost: number;
  totalEnergyCost: number;
  unservedHours: number;      // 全年未供电小时数（E8 断电损失量纲）
  pvSelfUse_kWh: number;      // 全年 PV 自用电量（电网可用时段）
  pvSelfUseValue: number;     // 全年 PV 自用价值
  dischargeValue: number;     // 全年储能放电价值（电网可用时段）
  gridCharge_kWh: number;     // 全年电网充电电量
  gridChargeCost: number;     // 全年电网充电成本
}
