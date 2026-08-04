import { CountryCode } from './project';

/** 国家模板参数 */
export interface CountryTemplate {
  id: CountryCode;
  name: string;
  nameEn: string;
  currency: string;
  currencySymbol: string;
  locale: string;

  pv: {
    referenceGHI: number;
    referenceCapacityFactor: number;
    deratingFactor: number;
  };

  bess: {
    defaultEfficiency: number;
    defaultDepthOfDischarge: number;
  };

  grid: {
    voltage: string;
    tariffStructure: 'tou' | 'flat';
    peakPrice: number;
    offPeakPrice: number;
    flatPrice: number;
    demandCharge: number;
    excessDemandRate: number;
    reliability: number;
    connectionVoltage: string;
  };

  diesel: {
    fuelPrice: number;
    priceGrowthRate: number;
    efficiency_kWhPerL: number;
  };

  financial: {
    discountRate: number;
    inflationRate: number;
    priceGrowth: number;
    opexGrowth: number;
    taxRate: number;
    exchangeRate: number;
  };

  capex: {
    pvCostPerKW: number;
    bessCostPerKWh: number;
    gridConnectionCost: number;
  };
}
