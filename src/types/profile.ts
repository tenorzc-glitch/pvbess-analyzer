/** 单个 15 分钟时段的 Profile 数据 */
export interface ProfileInterval {
  load_kW: number;        // 该时段负荷(kW)
  pvPerUnit: number;      // 光伏标幺值 0~1
  gridAvailable: boolean; // 电网是否可用
  gridPrice: number;      // 购电价(当地货币/kWh)
  daysInMonth: number;    // 当月天数
}

/** 12 个典型月日 × 96 个 15 分钟时段 */
export type ProfileData = ProfileInterval[][];

/** 室外气温数据（12 月 × 96 点，°C）——仅数据层，未接入引擎 */
export interface AmbientTempData {
  unit: string;
  granularity: string;
  note: string;
  monthlyMean: number[];
  diurnalAmplitude: number;
  profile: number[][];
}

/** Profile 元信息 */
export interface ProfileMeta {
  id: string;
  name: string;
  type: 'template' | 'uploaded' | 'custom';
  source: string;
  description: string;
  createdAt: string;
}
