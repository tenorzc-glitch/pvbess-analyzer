import { InputParams } from '../types';
import { DEFAULT_PARAMS } from '../store/default-params';

/** 参数结构版本：v2 = CAPEX 两项化 + 停电模型 + OPEX 两段制（2026-08 修订） */
export const PARAMS_VERSION = 2;

/**
 * 参数迁移：以 DEFAULT_PARAMS 为骨架做**键名白名单递归合并**。
 *
 * - 只拷贝 DEFAULT 中存在的 key：旧字段（pvFixedCost / pcsCost_perkW /
 *   annualDegradation / balancingSchedule 等）自动丢弃；
 * - 缺失的新字段（grid.outage / 两段制 opex 等）取默认值；
 * - 固定长度数组（sohCurve / eventDaysPerMonth / maintenanceDaysPerMonth）
 *   长度不符回退默认；可变长度数组（rainyMonths / rainyOutageDays）接受任意数值数组。
 *
 * 老项目（v1 JSON）经此函数后保证结构完整、不含残留旧 key。
 */
export function migrateParams(stored: unknown): InputParams {
  const base = JSON.parse(JSON.stringify(DEFAULT_PARAMS)) as InputParams;
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return base;
  mergeInto(base, stored as Record<string, unknown>);
  return base;
}

/** 可变长度数组字段白名单 */
const VARIABLE_ARRAY_KEYS = new Set(['rainyMonths', 'rainyOutageDays']);

function isNumericArray(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'number' && !Number.isNaN(x));
}

function mergeInto(target: Record<string, any>, source: Record<string, unknown>): void {
  for (const key of Object.keys(target)) {
    if (!(key in source)) continue;
    const tv = target[key];
    const sv = source[key];

    if (Array.isArray(tv)) {
      if (!isNumericArray(sv)) continue;
      if (VARIABLE_ARRAY_KEYS.has(key)) {
        target[key] = [...sv];
      } else if (sv.length === tv.length) {
        target[key] = [...sv];
      }
      // 长度不符 → 保留默认
    } else if (tv !== null && typeof tv === 'object') {
      if (sv && typeof sv === 'object' && !Array.isArray(sv)) {
        mergeInto(tv, sv as Record<string, unknown>);
      }
    } else if (typeof sv === typeof tv) {
      target[key] = sv;
    }
  }
}
