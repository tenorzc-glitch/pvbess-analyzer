import { InputParams } from '../types/params';

/** 支持的货币选项（名称经 i18n 渲染） */
export const CURRENCY_OPTIONS = [
  { value: 'BRL', symbol: 'R$', locale: 'pt-BR' },
  { value: 'USD', symbol: '$', locale: 'en-US' },
  { value: 'EUR', symbol: '€', locale: 'de-DE' },
  { value: 'CNY', symbol: '¥', locale: 'zh-CN' },
  { value: 'MXN', symbol: 'MX$', locale: 'es-MX' },
  { value: 'COP', symbol: 'COP$', locale: 'es-CO' },
  { value: 'CLP', symbol: 'CLP$', locale: 'es-CL' },
  { value: 'PEN', symbol: 'S/', locale: 'es-PE' },
];

/**
 * 货币换算工具（展示层/编辑层）：
 * 汇率表定义 = 1 单位外币 = X BRL（BRL=1 为基准）。
 * 切换货币时按 value_new = value_old × rate[from] / rate[to] 换算所有单价字段。
 */

/** 需要随货币换算的参数路径（dotted path） */
const MONEY_PATHS: string[] = [
  'grid.peakPrice_perkWh',
  'grid.offPeakPrice_perkWh',
  'grid.flatPrice_perkWh',
  'grid.demandCharge_perKW',
  'grid.excessDemandRate',
  'grid.feedInPrice_perkWh',
  'diesel.fuelPrice_perL',
  'capex.pvCost_perkW',
  'capex.bessCost_perkWh',
  'opex.laborRate',
  'opex.travelCost',
  'opex.equipmentCost',
  'opex.coolantCost',
  'opex.dieselMaintenancePerkWh',
  'outageLoss.dailyProductionValue',
  'greenPremium.premiumRate',
];

function getPath(obj: any, path: string): any {
  return path.split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
}
function setPath(obj: any, path: string, value: any): void {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

/** 品牌参数中的货币量纲字段（FALLBACK 为 BRL 口径） */
export const BRAND_MONEY_FIELDS = [
  'costPerKWh',
  'coolantCostPerEvent',
  'calibrationVisitCost',
  'warrantyCostPerKWhYear',
] as const;

/** 换算一组品牌参数（返回新对象，不改原值） */
export function convertBrandMoney<T extends Record<string, any>>(brand: T, factor: number): T {
  if (factor === 1) return brand;
  const next = { ...brand };
  for (const f of BRAND_MONEY_FIELDS) {
    const v = next[f];
    if (typeof v === 'number' && Number.isFinite(v)) {
      (next as any)[f] = +(v * factor).toFixed(4);
    }
  }
  return next;
}

/** 有效汇率（缺失时回落 1，并警告） */
export function rateOf(params: InputParams, code: string): number {
  const r = params.exchangeRates?.[code];
  return typeof r === 'number' && r > 0 ? r : 1;
}

/**
 * 切换货币：返回所有单价字段已按汇率换算的新 params（不改原对象）。
 * from/to 为货币代码（如 'BRL' → 'USD'）。
 */
export function convertCurrencyParams(params: InputParams, fromCode: string, toCode: string): InputParams {
  if (fromCode === toCode) return params;
  const from = rateOf(params, fromCode);
  const to = rateOf(params, toCode);
  if (from === to) return params;
  const factor = from / to;

  const next: InputParams = JSON.parse(JSON.stringify(params));
  for (const path of MONEY_PATHS) {
    const v = getPath(next, path);
    if (typeof v === 'number' && Number.isFinite(v)) {
      setPath(next, path, +(v * factor).toFixed(6));
    }
  }
  // tariffSegments 价格数组
  if (Array.isArray(next.grid.tariffSegments)) {
    next.grid.tariffSegments = next.grid.tariffSegments.map((s) => ({
      ...s,
      price: +(s.price * factor).toFixed(6),
    }));
  }
  return next;
}
