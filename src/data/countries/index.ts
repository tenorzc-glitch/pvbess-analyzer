import { InputParams } from '../../types';
import { CountryCode } from '../../types/project';
import { DEFAULT_PARAMS } from '../../store/useParamsStore';

/**
 * 国家 + 行业预设参数
 *
 * 巴西（咖啡种植/加工）：取自用户实测数据（Brazil_Coffee_Farm 15min 负荷 +
 * 屋顶辐照曲线），电价为 Cemig-D 白色分时（谷 0.748 / 峰 1.734 BRL/kWh）。
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
  /** 辐照/气温基线数据文件（public 下路径）；brazil 特殊：实测 JSON */
  profileRef: string;
  /** 预设说明（展示在创建项目对话框） */
  note: { zh: string; en: string };
}

const NASA = (code: string) => `/data/profiles/${code}.json`;

export const COUNTRY_PRESETS: Partial<Record<CountryCode, CountryPreset>> = {
  brazil: {
    currency: { code: 'BRL', symbol: 'R$', locale: 'pt-BR' },
    grid: {
      tariffType: 'tou',
      flatPrice_perkWh: 0.748,
      peakPrice_perkWh: 1.734,
      offPeakPrice_perkWh: 0.748,
      demandCharge_perKW: 45,
      excessDemandRate: 90,
    },
    diesel: { fuelPrice_perL: 6.82 },
    profileRef: '/data/brazil_test_data.json',
    note: {
      zh: '咖啡种植/加工实测负荷曲线 + 屋顶辐照（15min），Cemig-D 白色分时电价',
      en: 'Real coffee farm load & rooftop irradiation profile (15-min), Cemig-D white TOU tariff',
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
    profileRef: NASA('mexico'),
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
    profileRef: NASA('mexico'),
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
    profileRef: NASA('mexico'),
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
    profileRef: NASA('mexico'),
    note: {
      zh: '工商业公开均价近似（可修改）',
      en: 'Approximate public C&I averages (editable)',
    },
  },
  // ── 中国四省（代理购电价近似，分时） ──
  cn_zhejiang: {
    currency: { code: 'CNY', symbol: '¥', locale: 'zh-CN' },
    grid: { tariffType: 'tou', flatPrice_perkWh: 0.62, peakPrice_perkWh: 1.10, offPeakPrice_perkWh: 0.35, demandCharge_perKW: 40, excessDemandRate: 80 },
    diesel: { fuelPrice_perL: 7.5 },
    profileRef: NASA('cn_zhejiang'),
    note: { zh: '代理购电价近似（可修改），NASA 基线（杭州）', en: 'Approximate retail tariff (editable), NASA baseline (Hangzhou)' },
  },
  cn_jiangsu: {
    currency: { code: 'CNY', symbol: '¥', locale: 'zh-CN' },
    grid: { tariffType: 'tou', flatPrice_perkWh: 0.60, peakPrice_perkWh: 1.05, offPeakPrice_perkWh: 0.33, demandCharge_perKW: 42, excessDemandRate: 84 },
    diesel: { fuelPrice_perL: 7.5 },
    profileRef: NASA('cn_jiangsu'),
    note: { zh: '代理购电价近似（可修改），NASA 基线（南京）', en: 'Approximate retail tariff (editable), NASA baseline (Nanjing)' },
  },
  cn_guangdong: {
    currency: { code: 'CNY', symbol: '¥', locale: 'zh-CN' },
    grid: { tariffType: 'tou', flatPrice_perkWh: 0.65, peakPrice_perkWh: 1.15, offPeakPrice_perkWh: 0.30, demandCharge_perKW: 38, excessDemandRate: 76 },
    diesel: { fuelPrice_perL: 7.8 },
    profileRef: NASA('cn_guangdong'),
    note: { zh: '代理购电价近似（可修改），NASA 基线（广州）', en: 'Approximate retail tariff (editable), NASA baseline (Guangzhou)' },
  },
  cn_shandong: {
    currency: { code: 'CNY', symbol: '¥', locale: 'zh-CN' },
    grid: { tariffType: 'tou', flatPrice_perkWh: 0.58, peakPrice_perkWh: 1.00, offPeakPrice_perkWh: 0.32, demandCharge_perKW: 40, excessDemandRate: 80 },
    diesel: { fuelPrice_perL: 7.3 },
    profileRef: NASA('cn_shandong'),
    note: { zh: '代理购电价近似（可修改），NASA 基线（济南）', en: 'Approximate retail tariff (editable), NASA baseline (Jinan)' },
  },
  // ── 欧洲 ──
  netherlands: {
    currency: { code: 'EUR', symbol: '€', locale: 'nl-NL' },
    grid: { tariffType: 'flat', flatPrice_perkWh: 0.28, peakPrice_perkWh: 0.38, offPeakPrice_perkWh: 0.22, demandCharge_perKW: 12, excessDemandRate: 24 },
    diesel: { fuelPrice_perL: 1.85 },
    profileRef: NASA('netherlands'),
    note: { zh: '工商业均价近似（可修改），NASA 基线（阿姆斯特丹）', en: 'Approximate C&I averages (editable), NASA baseline (Amsterdam)' },
  },
  germany: {
    currency: { code: 'EUR', symbol: '€', locale: 'de-DE' },
    grid: { tariffType: 'flat', flatPrice_perkWh: 0.30, peakPrice_perkWh: 0.40, offPeakPrice_perkWh: 0.24, demandCharge_perKW: 14, excessDemandRate: 28 },
    diesel: { fuelPrice_perL: 1.75 },
    profileRef: NASA('germany'),
    note: { zh: '工商业均价近似（可修改），NASA 基线（慕尼黑）', en: 'Approximate C&I averages (editable), NASA baseline (Munich)' },
  },
  italy: {
    currency: { code: 'EUR', symbol: '€', locale: 'it-IT' },
    grid: { tariffType: 'flat', flatPrice_perkWh: 0.29, peakPrice_perkWh: 0.39, offPeakPrice_perkWh: 0.23, demandCharge_perKW: 13, excessDemandRate: 26 },
    diesel: { fuelPrice_perL: 1.80 },
    profileRef: NASA('italy'),
    note: { zh: '工商业均价近似（可修改），NASA 基线（罗马）', en: 'Approximate C&I averages (editable), NASA baseline (Rome)' },
  },
  poland: {
    currency: { code: 'PLN', symbol: 'zł', locale: 'pl-PL' },
    grid: { tariffType: 'flat', flatPrice_perkWh: 0.85, peakPrice_perkWh: 1.15, offPeakPrice_perkWh: 0.65, demandCharge_perKW: 35, excessDemandRate: 70 },
    diesel: { fuelPrice_perL: 6.5 },
    profileRef: NASA('poland'),
    note: { zh: '工商业均价近似（可修改），NASA 基线（华沙）', en: 'Approximate C&I averages (editable), NASA baseline (Warsaw)' },
  },
  ukraine: {
    currency: { code: 'UAH', symbol: '₴', locale: 'uk-UA' },
    grid: { tariffType: 'flat', flatPrice_perkWh: 4.5, peakPrice_perkWh: 6.0, offPeakPrice_perkWh: 3.5, demandCharge_perKW: 150, excessDemandRate: 300 },
    diesel: { fuelPrice_perL: 52 },
    profileRef: NASA('ukraine'),
    note: { zh: '工商业均价近似（可修改），NASA 基线（基辅）', en: 'Approximate C&I averages (editable), NASA baseline (Kyiv)' },
  },
  sweden: {
    currency: { code: 'SEK', symbol: 'kr', locale: 'sv-SE' },
    grid: { tariffType: 'flat', flatPrice_perkWh: 1.2, peakPrice_perkWh: 1.6, offPeakPrice_perkWh: 0.9, demandCharge_perKW: 55, excessDemandRate: 110 },
    diesel: { fuelPrice_perL: 20 },
    profileRef: NASA('sweden'),
    note: { zh: '工商业均价近似（可修改），NASA 基线（斯德哥尔摩）', en: 'Approximate C&I averages (editable), NASA baseline (Stockholm)' },
  },
  spain: {
    currency: { code: 'EUR', symbol: '€', locale: 'es-ES' },
    grid: { tariffType: 'flat', flatPrice_perkWh: 0.24, peakPrice_perkWh: 0.32, offPeakPrice_perkWh: 0.19, demandCharge_perKW: 10, excessDemandRate: 20 },
    diesel: { fuelPrice_perL: 1.65 },
    profileRef: NASA('spain'),
    note: { zh: '工商业均价近似（可修改），NASA 基线（塞维利亚）', en: 'Approximate C&I averages (editable), NASA baseline (Seville)' },
  },
  bulgaria: {
    currency: { code: 'BGN', symbol: 'лв', locale: 'bg-BG' },
    grid: { tariffType: 'flat', flatPrice_perkWh: 0.36, peakPrice_perkWh: 0.48, offPeakPrice_perkWh: 0.28, demandCharge_perKW: 18, excessDemandRate: 36 },
    diesel: { fuelPrice_perL: 2.9 },
    profileRef: NASA('bulgaria'),
    note: { zh: '工商业均价近似（可修改），NASA 基线（索非亚）', en: 'Approximate C&I averages (editable), NASA baseline (Sofia)' },
  },
  // ── 非洲 ──
  south_africa: {
    currency: { code: 'ZAR', symbol: 'R', locale: 'en-ZA' },
    grid: { tariffType: 'tou', flatPrice_perkWh: 2.4, peakPrice_perkWh: 4.5, offPeakPrice_perkWh: 1.6, demandCharge_perKW: 120, excessDemandRate: 240 },
    diesel: { fuelPrice_perL: 22 },
    profileRef: NASA('south_africa'),
    note: { zh: '工商业均价近似（可修改），NASA 基线（约翰内斯堡）', en: 'Approximate C&I averages (editable), NASA baseline (Johannesburg)' },
  },
  nigeria: {
    currency: { code: 'NGN', symbol: '₦', locale: 'en-NG' },
    grid: { tariffType: 'flat', flatPrice_perkWh: 120, peakPrice_perkWh: 160, offPeakPrice_perkWh: 95, demandCharge_perKW: 3000, excessDemandRate: 6000 },
    diesel: { fuelPrice_perL: 1100 },
    profileRef: NASA('nigeria'),
    note: { zh: '工商业均价近似（可修改），NASA 基线（拉各斯）', en: 'Approximate C&I averages (editable), NASA baseline (Lagos)' },
  },
  dr_congo: {
    currency: { code: 'CDF', symbol: 'FC', locale: 'fr-CD' },
    grid: { tariffType: 'flat', flatPrice_perkWh: 250, peakPrice_perkWh: 330, offPeakPrice_perkWh: 200, demandCharge_perKW: 8000, excessDemandRate: 16000 },
    diesel: { fuelPrice_perL: 2800 },
    profileRef: NASA('dr_congo'),
    note: { zh: '工商业均价近似（可修改），NASA 基线（金沙萨）', en: 'Approximate C&I averages (editable), NASA baseline (Kinshasa)' },
  },
  // ── 亚太 ──
  malaysia: {
    currency: { code: 'MYR', symbol: 'RM', locale: 'ms-MY' },
    grid: { tariffType: 'tou', flatPrice_perkWh: 0.42, peakPrice_perkWh: 0.60, offPeakPrice_perkWh: 0.30, demandCharge_perKW: 25, excessDemandRate: 50 },
    diesel: { fuelPrice_perL: 3.2 },
    profileRef: NASA('malaysia'),
    note: { zh: '工商业均价近似（可修改），NASA 基线（吉隆坡）', en: 'Approximate C&I averages (editable), NASA baseline (Kuala Lumpur)' },
  },
  thailand: {
    currency: { code: 'THB', symbol: '฿', locale: 'th-TH' },
    grid: { tariffType: 'tou', flatPrice_perkWh: 4.2, peakPrice_perkWh: 5.8, offPeakPrice_perkWh: 2.8, demandCharge_perKW: 220, excessDemandRate: 440 },
    diesel: { fuelPrice_perL: 32 },
    profileRef: NASA('thailand'),
    note: { zh: '工商业均价近似（可修改），NASA 基线（曼谷）', en: 'Approximate C&I averages (editable), NASA baseline (Bangkok)' },
  },
  indonesia: {
    currency: { code: 'IDR', symbol: 'Rp', locale: 'id-ID' },
    grid: { tariffType: 'flat', flatPrice_perkWh: 1450, peakPrice_perkWh: 1900, offPeakPrice_perkWh: 1100, demandCharge_perKW: 42000, excessDemandRate: 84000 },
    diesel: { fuelPrice_perL: 13500 },
    profileRef: NASA('indonesia'),
    note: { zh: '工商业均价近似（可修改），NASA 基线（雅加达）', en: 'Approximate C&I averages (editable), NASA baseline (Jakarta)' },
  },
  japan: {
    currency: { code: 'JPY', symbol: '¥', locale: 'ja-JP' },
    grid: { tariffType: 'tou', flatPrice_perkWh: 18, peakPrice_perkWh: 28, offPeakPrice_perkWh: 12, demandCharge_perKW: 1200, excessDemandRate: 2400 },
    diesel: { fuelPrice_perL: 160 },
    profileRef: NASA('japan'),
    note: { zh: '工商业均价近似（可修改），NASA 基线（东京）', en: 'Approximate C&I averages (editable), NASA baseline (Tokyo)' },
  },
  australia: {
    currency: { code: 'AUD', symbol: 'A$', locale: 'en-AU' },
    grid: { tariffType: 'tou', flatPrice_perkWh: 0.28, peakPrice_perkWh: 0.42, offPeakPrice_perkWh: 0.18, demandCharge_perKW: 15, excessDemandRate: 30 },
    diesel: { fuelPrice_perL: 1.95 },
    profileRef: NASA('australia'),
    note: { zh: '工商业均价近似（可修改），NASA 基线（悉尼）', en: 'Approximate C&I averages (editable), NASA baseline (Sydney)' },
  },
};

/** 国家 profile 数据文件路径（brazil 为实测 JSON，其余为 NASA 基线） */
export function countryProfileRef(country: CountryCode): string {
  return COUNTRY_PRESETS[country]?.profileRef ?? '/data/brazil_test_data.json';
}

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
