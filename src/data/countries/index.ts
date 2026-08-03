import { InputParams } from '../../types';
import { CountryCode } from '../../types/project';
import { DEFAULT_PARAMS } from '../../store/useParamsStore';

/**
 * 国家 + 行业预设参数
 *
 * 巴西（咖啡种植/加工）：取自用户实测数据（Brazil_Coffee_Farm 15min 负荷 +
 * 屋顶辐照曲线），电价为巴西工商业水平（峰 0.95 / 谷 0.65 BRL/kWh）。
 * 其他国家：公开工商业均价近似值，均可在录入界面直接修改。
 */
export interface CountryPreset {
  currency: { code: string; symbol: string; locale: string };
  grid: {
    tariffType: 'tou' | 'flat';
    flatPrice_perkWh: number;
    peakPrice_perkWh: number;
    offPeakPrice_perkWh: number;
    demandCharge_perKW: number;
    excessDemandRate: number;
  };
  diesel: { fuelPrice_perL: number };
  /** 预设说明（展示在创建项目对话框） */
  note: { zh: string; en: string };
}

export const COUNTRY_PRESETS: Partial<Record<CountryCode, CountryPreset>> = {
  brazil: {
    currency: { code: 'BRL', symbol: 'R$', locale: 'pt-BR' },
    grid: {
      tariffType: 'flat',
      flatPrice_perkWh: 0.65,
      peakPrice_perkWh: 0.95,
      offPeakPrice_perkWh: 0.65,
      demandCharge_perKW: 45,
      excessDemandRate: 90,
    },
    diesel: { fuelPrice_perL: 6.0 },
    note: {
      zh: '咖啡种植/加工实测负荷曲线 + 屋顶辐照（15min），工商业电价',
      en: 'Real coffee farm load & rooftop irradiation profile (15-min), C&I tariff',
    },
  },
  mexico: {
    currency: { code: 'MXN', symbol: 'MX$', locale: 'es-MX' },
    grid: {
      tariffType: 'tou',
      flatPrice_perkWh: 2.0,
      peakPrice_perkWh: 2.8,
      offPeakPrice_perkWh: 1.7,
      demandCharge_perKW: 180,
      excessDemandRate: 360,
    },
    diesel: { fuelPrice_perL: 24 },
    note: {
      zh: '工商业公开均价近似（可修改）',
      en: 'Approximate public C&I averages (editable)',
    },
  },
  colombia: {
    currency: { code: 'COP', symbol: 'COP$', locale: 'es-CO' },
    grid: {
      tariffType: 'flat',
      flatPrice_perkWh: 620,
      peakPrice_perkWh: 850,
      offPeakPrice_perkWh: 550,
      demandCharge_perKW: 28000,
      excessDemandRate: 56000,
    },
    diesel: { fuelPrice_perL: 10500 },
    note: {
      zh: '工商业公开均价近似（可修改）',
      en: 'Approximate public C&I averages (editable)',
    },
  },
  chile: {
    currency: { code: 'CLP', symbol: 'CLP$', locale: 'es-CL' },
    grid: {
      tariffType: 'flat',
      flatPrice_perkWh: 115,
      peakPrice_perkWh: 160,
      offPeakPrice_perkWh: 95,
      demandCharge_perKW: 5500,
      excessDemandRate: 11000,
    },
    diesel: { fuelPrice_perL: 1150 },
    note: {
      zh: '工商业公开均价近似（可修改）',
      en: 'Approximate public C&I averages (editable)',
    },
  },
  peru: {
    currency: { code: 'PEN', symbol: 'S/', locale: 'es-PE' },
    grid: {
      tariffType: 'flat',
      flatPrice_perkWh: 0.55,
      peakPrice_perkWh: 0.75,
      offPeakPrice_perkWh: 0.45,
      demandCharge_perKW: 28,
      excessDemandRate: 56,
    },
    diesel: { fuelPrice_perL: 6.5 },
    note: {
      zh: '工商业公开均价近似（可修改）',
      en: 'Approximate public C&I averages (editable)',
    },
  },
};

/** 基于默认参数应用国家预设，返回新的 InputParams */
export function applyCountryPreset(country: CountryCode, base?: InputParams): InputParams {
  const params: InputParams = JSON.parse(JSON.stringify(base ?? DEFAULT_PARAMS));
  const preset = COUNTRY_PRESETS[country];
  if (!preset) return params; // custom / 未知国家：保持默认

  params.currency = { ...preset.currency };
  params.grid.tariffType = preset.grid.tariffType;
  params.grid.flatPrice_perkWh = preset.grid.flatPrice_perkWh;
  params.grid.peakPrice_perkWh = preset.grid.peakPrice_perkWh;
  params.grid.offPeakPrice_perkWh = preset.grid.offPeakPrice_perkWh;
  params.grid.demandCharge_perKW = preset.grid.demandCharge_perKW;
  params.grid.excessDemandRate = preset.grid.excessDemandRate;
  params.diesel.fuelPrice_perL = preset.diesel.fuelPrice_perL;
  return params;
}
