/**
 * SOH 衰减模型
 * 
 * 电池健康状态逐年衰减，影响可用容量。
 * 默认 15 年曲线：Y1=100%, Y15=65%
 */

/** 默认 SOH 衰减曲线（15 年） */
export const DEFAULT_SOH_CURVE: number[] = [
  1.000, 0.975, 0.950, 0.925, 0.900,
  0.875, 0.850, 0.825, 0.800, 0.775,
  0.750, 0.725, 0.700, 0.675, 0.650
];

/**
 * 计算第 N 年的有效电池容量
 */
export function getEffectiveCapacity(
  nominalCapacity_kWh: number,
  year: number,
  sohCurve: number[] = DEFAULT_SOH_CURVE
): number {
  const soh = sohCurve[Math.min(year - 1, sohCurve.length - 1)];
  return nominalCapacity_kWh * (soh ?? 1.0);
}
