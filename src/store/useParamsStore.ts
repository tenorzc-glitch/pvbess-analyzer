import { create } from 'zustand';
import { InputParams } from '../types';

/** 默认巴西参数 */
export const DEFAULT_PARAMS: InputParams = {
  timeStep: 0.25,

  pv: {
    capacity_kWp: 500,
    deratingFactor: 0.82,
    annualDegradation: 0.005,
  },

  bess: {
    cRate: 0.5,
    efficiencyCharge: 0.96,
    efficiencyDischarge: 0.96,
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
    fuelPrice_perL: 6,
    fuelPriceGrowth: 0.04,
  },

  grid: {
    contractDemand_kW: 300,
    demandCharge_perKW: 45,
    excessDemandTolerance: 0.05,
    excessDemandRate: 90,
    tariffType: 'flat',
    peakPrice_perkWh: 0.95,
    offPeakPrice_perkWh: 0.65,
    flatPrice_perkWh: 0.65,
    feedInPrice_perkWh: 0,
    enablePeakArbitrage: false,
  },

  capex: {
    pvCost_perkW: 3500,
    pvFixedCost: 100000,
    bessCost_perkWh: 1350,
    pcsCost_perkW: 650,
    bessFixedCost: 150000,
    installationPct: 0.10,
    remoteTransport: 80000,
  },

  opex: {
    pvFixedOpexRate: 0.01,
    bessFixedOpexRate: 0.015,
    dieselMaintenancePerkWh: 0.05,
    balancingSchedule: [0, 1, 2, 3],
    balancingCrew: 2,
    balancingHours: 16,
    laborRate: 150,
    travelCost: 3000,
    equipmentCost: 1000,
    coolantInterval: 5,
    coolantCost: 20000,
  },

  financial: {
    projectLife: 10,
    discountRate: 0.10,
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
  ],

  selectedScheme: 4,
};

interface ParamsState {
  params: InputParams;
  setParams: (params: InputParams) => void;
  updateParams: (updates: Partial<InputParams>) => void;
  resetParams: () => void;
}

export const useParamsStore = create<ParamsState>((set) => ({
  params: { ...DEFAULT_PARAMS },

  setParams: (params) => set({ params }),

  updateParams: (updates) =>
    set((state) => ({
      params: { ...state.params, ...updates },
    })),

  resetParams: () => set({ params: { ...DEFAULT_PARAMS } }),
}));
