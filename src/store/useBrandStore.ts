import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { BrandParams, FALLBACK_BRANDS } from '../utils/brand';

/**
 * 多品牌对比配置（模块C v2：下拉菜单模式）：
 * - 品牌模板固定：行业基准（不可删）+ HW + Brand X + Brand Y + Brand Z
 * - X/Y/Z 默认复制行业基准参数，可手动修改
 * - 修改经"保存"写入 store（persist 到 localStorage），下次选取按保存值运行
 * - "恢复默认值"回退到模板初始参数
 */
export interface BrandConfig {
  id: string;               // 'industry_avg' | 'HW' | 'brand_x' | 'brand_y' | 'brand_z'
  templateId: string;       // 对应的模板 id（恢复默认值用）
  label: string;            // 显示名（可编辑）
  isBaseline: boolean;      // 行业基准不可删除
  params: BrandParams;
}

/** 品牌模板库：下拉菜单的可选项 */
export interface BrandTemplate {
  id: string;
  label: string;
  params: BrandParams;
}

const clone = (p: BrandParams): BrandParams => ({ ...p, sohCurve: [...p.sohCurve] });

export const BRAND_TEMPLATES: BrandTemplate[] = [
  { id: 'HW', label: 'HW', params: clone(FALLBACK_BRANDS.HW) },
  { id: 'brand_x', label: 'Brand X', params: clone(FALLBACK_BRANDS.industry_avg) },
  { id: 'brand_y', label: 'Brand Y', params: clone(FALLBACK_BRANDS.industry_avg) },
  { id: 'brand_z', label: 'Brand Z', params: clone(FALLBACK_BRANDS.industry_avg) },
];

interface BrandState {
  brands: BrandConfig[];
  activeCompareIds: string[];

  /** 从模板添加品牌（已存在则忽略） */
  addBrand: (templateId: string) => void;
  removeBrand: (id: string) => void;
  renameBrand: (id: string, label: string) => void;
  updateBrandParams: (id: string, patch: Partial<BrandParams>) => void;
  /** 恢复该品牌模板默认参数 */
  resetBrandParams: (id: string) => void;
  setActiveCompareIds: (ids: string[]) => void;
  setBrands: (brands: BrandConfig[]) => void;
}

const baselineBrand = (): BrandConfig => ({
  id: 'industry_avg',
  templateId: 'industry_avg',
  label: 'Industry Baseline',
  isBaseline: true,
  params: clone(FALLBACK_BRANDS.industry_avg),
});

const defaultBrands = (): BrandConfig[] => [
  baselineBrand(),
  { id: 'HW', templateId: 'HW', label: 'HW', isBaseline: false, params: clone(FALLBACK_BRANDS.HW) },
];

/** 根据 id/label 推断模板 id（persist 旧数据迁移用） */
function inferTemplateId(b: any): string {
  if (b.templateId) return b.templateId;
  if (b.id === 'industry_avg' || b.isBaseline) return 'industry_avg';
  if (b.id === 'HW' || b.label === 'HW') return 'HW';
  if (typeof b.id === 'string' && b.id.startsWith('brand_x')) return 'brand_x';
  if (typeof b.id === 'string' && b.id.startsWith('brand_y')) return 'brand_y';
  if (typeof b.id === 'string' && b.id.startsWith('brand_z')) return 'brand_z';
  const lbl = String(b.label || '');
  if (lbl.includes('X')) return 'brand_x';
  if (lbl.includes('Y')) return 'brand_y';
  if (lbl.includes('Z')) return 'brand_z';
  return 'brand_x';
}

export const useBrandStore = create<BrandState>()(
  persist(
    (set) => ({
      brands: defaultBrands(),
      activeCompareIds: ['HW'],

      addBrand: (templateId) =>
        set((s) => {
          const tpl = BRAND_TEMPLATES.find((t) => t.id === templateId);
          if (!tpl || s.brands.some((b) => b.id === templateId)) return s;
          return {
            brands: [
              ...s.brands,
              { id: tpl.id, templateId: tpl.id, label: tpl.label, isBaseline: false, params: clone(tpl.params) },
            ],
            activeCompareIds: [...s.activeCompareIds, tpl.id],
          };
        }),

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

      resetBrandParams: (id) =>
        set((s) => ({
          brands: s.brands.map((b) => {
            if (b.id !== id) return b;
            const tpl = BRAND_TEMPLATES.find((t) => t.id === b.templateId);
            const fallbackParams = b.templateId === 'industry_avg'
              ? FALLBACK_BRANDS.industry_avg
              : tpl?.params ?? FALLBACK_BRANDS.industry_avg;
            return { ...b, params: clone(fallbackParams) };
          }),
        })),

      setActiveCompareIds: (ids) => set({ activeCompareIds: ids }),
      setBrands: (brands) => set({ brands }),
    }),
    {
      name: 'pvbess-brands',
      version: 2,
      migrate: (persisted: any) => {
        // v1 → v2：补 templateId 字段
        if (persisted && Array.isArray(persisted.brands)) {
          persisted.brands = persisted.brands.map((b: any) => ({
            ...b,
            templateId: inferTemplateId(b),
          }));
        }
        return persisted;
      },
    },
  ),
);
