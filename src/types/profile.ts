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

/** Profile 元信息 */
export interface ProfileMeta {
  id: string;
  name: string;
  type: 'template' | 'uploaded' | 'custom';
  source: string;
  description: string;
  createdAt: string;
}
