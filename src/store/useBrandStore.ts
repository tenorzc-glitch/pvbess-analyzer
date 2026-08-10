import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { BrandParams, FALLBACK_BRANDS } from '../utils/brand';

/**
 * 多品牌对比配置（模块C）：
 * - brands 为动态数组：行业基准（isBaseline，不可删）+ HW + 用户自定义 Brand X/Y/Z
 * - 新增品牌默认复制行业基准参数，全部字段可手动修改
 * - activeCompareIds 控制报告/对比面板参与对比的品牌
 */
export interface BrandConfig {
  id: string;               // 'industry_avg' | 'HW' | 'brand_x' | ...
  label: string;            // 显示名（可编辑）
  isBaseline: boolean;      // 行业基准不可删除
  params: BrandParams;
}

interface BrandState {
  brands: BrandConfig[];
  activeCompareIds: string[];

  addBrand: (label?: string) => string;  // 返回新品牌 id
  removeBrand: (id: string) => void;
  renameBrand: (id: string, label: string) => void;
  updateBrandParams: (id: string, patch: Partial<BrandParams>) => void;
  setActiveCompareIds: (ids: string[]) => void;
  setBrands: (brands: BrandConfig[]) => void;
}

let brandCounter = 0;
const nextBrandId = () => `brand_${String.fromCharCode(120 + (brandCounter++ % 26))}_${Date.now() % 10000}`;

const defaultBrands = (): BrandConfig[] => [
  { id: 'industry_avg', label: 'Industry Baseline', isBaseline: true, params: { ...FALLBACK_BRANDS.industry_avg, sohCurve: [...FALLBACK_BRANDS.industry_avg.sohCurve] } },
  { id: 'HW', label: 'HW', isBaseline: false, params: { ...FALLBACK_BRANDS.HW, sohCurve: [...FALLBACK_BRANDS.HW.sohCurve] } },
];

export const useBrandStore = create<BrandState>()(
  persist(
    (set) => ({
      brands: defaultBrands(),
      activeCompareIds: ['HW'],

      addBrand: (label) => {
        const id = nextBrandId();
        set((s) => ({
          brands: [
            ...s.brands,
            {
              id,
              label: label ?? `Brand ${String.fromCharCode(88 + s.brands.length - 2)}`, // X, Y, Z...
              isBaseline: false,
              params: { ...FALLBACK_BRANDS.industry_avg, sohCurve: [...FALLBACK_BRANDS.industry_avg.sohCurve] },
            },
          ],
          activeCompareIds: [...s.activeCompareIds, id],
        }));
        return id;
      },

      removeBrand: (id) =>
        set((s) => ({
          brands: s.brands.filter((b) => b.id !== id || b.isBaseline),
          activeCompareIds: s.activeCompareIds.filter((x) => x !== id),
        })),

      renameBrand: (id, label) =>
        set((s) => ({
          brands: s.brands.map((b) => (b.id === id ? { ...b, label } : b)),
        })),

      updateBrandParams: (id, patch) =>
        set((s) => ({
          brands: s.brands.map((b) =>
            b.id === id ? { ...b, params: { ...b.params, ...patch } } : b
          ),
        })),

      setActiveCompareIds: (ids) => set({ activeCompareIds: ids }),
      setBrands: (brands) => set({ brands }),
    }),
    { name: 'pvbess-brands' },
  ),
);
