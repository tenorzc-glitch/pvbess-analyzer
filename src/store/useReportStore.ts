import { create } from 'zustand';

/**
 * 报告共享状态：
 * - includeHW 由 ComparePanel 的华为对比 Switch 写入（需求②：打开华为对比后报告自动含华为章）
 * - customerName/companyName 用于报告封面
 * - scenarioId 为报告选定方案；null = 自动取 NPV 最优档
 */
interface ReportState {
  includeHW: boolean;
  customerName: string;
  companyName: string;
  scenarioId: number | null;

  setIncludeHW: (b: boolean) => void;
  setCustomerName: (s: string) => void;
  setCompanyName: (s: string) => void;
  setScenarioId: (id: number | null) => void;
}

export const useReportStore = create<ReportState>((set) => ({
  includeHW: false,
  customerName: '',
  companyName: '',
  scenarioId: null,

  setIncludeHW: (b) => set({ includeHW: b }),
  setCustomerName: (s) => set({ customerName: s }),
  setCompanyName: (s) => set({ companyName: s }),
  setScenarioId: (id) => set({ scenarioId: id }),
}));
