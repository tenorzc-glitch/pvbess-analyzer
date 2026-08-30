/** 国家代码（22 个预设 + custom） */
export type CountryCode =
  | 'brazil' | 'mexico' | 'colombia' | 'chile' | 'peru'
  | 'cn_zhejiang' | 'cn_jiangsu' | 'cn_guangdong' | 'cn_shandong'
  | 'netherlands' | 'germany' | 'italy' | 'poland' | 'ukraine' | 'sweden'
  | 'spain' | 'bulgaria'
  | 'south_africa' | 'nigeria' | 'dr_congo'
  | 'malaysia' | 'thailand' | 'indonesia' | 'japan' | 'australia'
  | 'custom';

/** 项目 */
export interface Project {
  id: string;
  name: string;
  country: CountryCode;
  description?: string;
  createdAt: string;
  updatedAt: string;
  status: 'draft' | 'complete';
  /** 云端持久化的输入参数（可选，本地项目可能没有） */
  params?: unknown;
  /** 云端持久化的方案配置（可选） */
  scenarios?: unknown;
  /** 归属用户（云端自动注入 _openid，本地为 'local'） */
  owner?: string;
}
