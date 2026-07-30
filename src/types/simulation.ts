/** 方案配置 */
export interface ScenarioConfig {
  id: number;
  name: string;
  pvCapacity_kWp: number;
  bessCapacity_kWh: number;
  pcsPower_kW: number;
  description?: string;
}

/** 单个 15 分钟仿真结果 */
export interface IntervalResult {
  pvGen_kW: number;
  bessCharge_kW: number;
  bessDischarge_kW: number;
  gridImport_kW: number;
  excessDemand_kW: number;
  dieselGen_kW: number;
  dieselFuel_L: number;
  curtailment_kW: number;
  unserved_kW: number;
  soc: number;
  netLoad_kW: number;
}

/** 典型日仿真结果 */
export interface TypicalDayResult {
  month: number;
  intervals: IntervalResult[];
  summary: DaySummary;
}

export interface DaySummary {
  totalPV_kWh: number;
  totalLoad_kWh: number;
  totalGrid_kWh: number;
  totalDiesel_kWh: number;
  totalDieselFuel_L: number;
  totalCurtailment_kWh: number;
  totalBessCharge_kWh: number;
  totalBessDischarge_kWh: number;
  totalUnserved_kWh: number;
  avgSoc: number;
}

/** 方案全年汇总 */
export interface AnnualSummary {
  totalPV_kWh: number;
  totalLoad_kWh: number;
  selfConsumption_kWh: number;
  selfSufficiency: number;       // 自发自用率
  gridDependency: number;        // 电网依赖度
  gridImport_kWh: number;
  gridExcess_kWh: number;
  diesel_kWh: number;
  dieselFuel_L: number;
  curtailment_kWh: number;
  curtailmentRate: number;       // 弃光率
  bessCycles: number;
  peakDemand_kW: number;
  avgSoc: number;

  gridCost: number;
  dieselCost: number;
  demandChargeCost: number;
  totalEnergyCost: number;
}

/** 单个方案完整仿真结果 */
export interface ScenarioResult {
  scenarioId: number;
  typicalDays: TypicalDayResult[];
  annual: AnnualSummary;
  // 基准（纯电网）场景
  baseline: BaselineResult;
}

/** 纯电网基准 */
export interface BaselineResult {
  annualGridCost: number;
  annualDieselCost: number;
  annualDemandCharge: number;
  annualTotalCost: number;
  gridImport_kWh: number;
  dieselFuel_L: number;
  peakDemand_kW: number;
}
