import { InputParams } from '../types';

/**
 * 默认参数（巴西咖啡农场，PARAMS_VERSION = 2）
 *
 * 关键标定（依据巴西咖啡农场实例校验报告修订）：
 * - 电价：Cemig-D 白色分时两段 谷 0.748 / 峰 1.734 BRL/kWh（峰段 17:30-20:30）
 * - 柴油：ANP 米纳斯吉拉斯州均价 6.82 BRL/L
 * - 储能综合效率：行业 RTE 85% → 充/放各 sqrt(0.85) ≈ 0.9219
 * - CAPEX 全包两项：PV 3700/kWp、BESS 2000/kWh（含 PCS/线缆/安装/运输）
 * - 停电模型：每月 3 个工作日各停 30 分钟（17:30 起），年停电 18h
 * - 财务：15 年寿命、12% 折现率
 */
export const DEFAULT_PARAMS: InputParams = {
  timeStep: 0.25,

  pv: {
    capacity_kWp: 500,
    deratingFactor: 0.82,
  },

  bess: {
    cRate: 0.5,
    efficiencyCharge: 0.9219,     // sqrt(0.85)
    efficiencyDischarge: 0.9219,  // sqrt(0.85)
    socMax: 0.95,
    socMin: 0.05,
    socGridForming: 0.15,
    socDieselTrigger: 0.20,
    socDieselStop: 0.50,
    socInitial: 0.60,
  },

  diesel: {
    ratedPower_kW: 400,
    minStablePower_kW: 80,
    efficiency_kWhPerL: 3.35,
    fuelPrice_perL: 6.82,
    fuelPriceGrowth: 0.04,
  },

  grid: {
    contractDemand_kW: 300,
    demandCharge_perKW: 45,
    excessDemandTolerance: 0.05,
    excessDemandRate: 90,
    tariffType: 'tou',
    peakPrice_perkWh: 1.734,
    offPeakPrice_perkWh: 0.748,
    flatPrice_perkWh: 0.748,
    feedInPrice_perkWh: 0,
    enablePeakArbitrage: false,
    outage: {
      eventDaysPerMonth: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
      eventMinutes: 30,
      windowStart: '17:30',
    },
  },

  capex: {
    pvCost_perkW: 3700,
    bessCost_perkWh: 2000,
  },

  opex: {
    pvFixedOpexRate: 0.01,
    bessFixedOpexRate: 0.015,
    dieselMaintenancePerkWh: 0.05,
    balancingVisitsY1to3: 2,
    balancingVisitsY4plus: 4,
    balancingCrew: 2,
    balancingHoursPerCabinet: 6,
    cabinetEnergyKwh: 261,
    laborRate: 150,
    travelCost: 3000,
    equipmentCost: 1000,
    coolantInterval: 5,
    coolantCost: 20000,
  },

  financial: {
    projectLife: 15,
    discountRate: 0.12,
    priceGrowth: 0.04,
    opexGrowth: 0.03,
    taxRate: 0,
  },

  load: {
    pumpRatedPower_kW: 180,
    pumpStartMultiplier: 3,
  },

  workDays: {
    // 默认：365 - 24(检修) - 41(雨季停运) = 300 天
    effectiveDaysPerYear: 300,
    rainyMonths: [12, 1, 2, 3],
    rainyOutageDays: [11, 12, 11, 7],
    maintenanceDaysPerMonth: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
  },

  greenPremium: {
    enabled: false,
    premiumRate: 0.02,
  },

  outageLoss: {
    enabled: false,
    dailyProductionValue: 5000,
    lossRate: 0.5,
  },

  currency: {
    code: 'BRL',
    symbol: 'R$',
    locale: 'pt-BR',
  },

  sohCurve: [
    1.000, 0.975, 0.950, 0.925, 0.900,
    0.875, 0.850, 0.825, 0.800, 0.775,
    0.750, 0.725, 0.700, 0.675, 0.650,
  ],

  selectedScheme: 4,
};
