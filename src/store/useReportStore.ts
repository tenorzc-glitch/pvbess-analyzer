import { create } from 'zustand';
import { DEFAULT_FX_RATE, ReportCurrencyCode } from '../utils/report-fx';

/**
 * 报告共享状态：
 * - includeHW 由 ComparePanel 的华为对比 Switch 写入（需求②：打开华为对比后报告自动含华为章）
 * - customerName/companyName 用于报告封面
 * - scenarioId 为报告选定方案；null = 自动取 NPV 最优档
 * - displayCurrency/fxRate：报告展示币种（引擎仍为 BRL，仅展示层换算）
 */
interface ReportState {
  includeHW: boolean;
  customerName: string;
  companyName: string;
  scenarioId: number | null;
  displayCurrency: ReportCurrencyCode;
  fxRate: number;

  setIncludeHW: (b: boolean) => void;
  setCustomerName: (s: string) => void;
  setCompanyName: (s: string) => void;
  setScenarioId: (id: number | null) => void;
  setDisplayCurrency: (c: ReportCurrencyCode) => void;
  setFxRate: (r: number) => void;
}

export const useReportStore = create<ReportState>((set) => ({
  includeHW: false,
  customerName: '',
  companyName: '',
  scenarioId: null,
  displayCurrency: 'BRL',
  fxRate: DEFAULT_FX_RATE,

  setIncludeHW: (b) => set({ includeHW: b }),
  setCustomerName: (s) => set({ customerName: s }),
  setCompanyName: (s) => set({ companyName: s }),
  setScenarioId: (id) => set({ scenarioId: id }),
  setDisplayCurrency: (c) => set({ displayCurrency: c }),
  setFxRate: (r) => set({ fxRate: r }),
}));
