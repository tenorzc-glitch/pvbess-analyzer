import { create } from 'zustand';
import { FinanceResult } from '../types/finance';

interface FinanceState {
  results: FinanceResult[] | null;
  isRunning: boolean;

  setResults: (results: FinanceResult[]) => void;
  setIsRunning: (running: boolean) => void;
  clearResults: () => void;
}

export const useFinanceStore = create<FinanceState>((set) => ({
  results: null,
  isRunning: false,

  setResults: (results) => set({ results, isRunning: false }),
  setIsRunning: (running) => set({ isRunning: running }),
  clearResults: () => set({ results: null }),
}));
