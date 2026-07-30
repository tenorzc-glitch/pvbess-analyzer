/** 国家代码 */
export type CountryCode = 'brazil' | 'mexico' | 'colombia' | 'chile' | 'peru' | 'custom';

/** 项目 */
export interface Project {
  id: string;
  name: string;
  country: CountryCode;
  description?: string;
  createdAt: string;
  updatedAt: string;
  status: 'draft' | 'complete';
}
