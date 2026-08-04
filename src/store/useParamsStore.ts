import { create } from 'zustand';
import { InputParams } from '../types';
import { DEFAULT_PARAMS } from './default-params';
import { migrateParams } from '../utils/migrate-params';

export { DEFAULT_PARAMS };

interface ParamsState {
  params: InputParams;
  setParams: (params: InputParams) => void;
  updateParams: (updates: Partial<InputParams>) => void;
  resetParams: () => void;
}

export const useParamsStore = create<ParamsState>((set) => ({
  params: migrateParams(undefined),

  // 统一过迁移器：云端/本地旧结构（v1）白名单合并为 v2， stale key 自动丢弃
  setParams: (params) => set({ params: migrateParams(params) }),

  updateParams: (updates) =>
    set((state) => ({
      params: migrateParams({ ...state.params, ...updates }),
    })),

  resetParams: () => set({ params: migrateParams(undefined) }),
}));
