import { create } from 'zustand';
import { ScenarioResult, ScenarioConfig } from '../types';
import { EngineScenarioResult, BaselineOutput } from '../engine/types';

interface SimulationState {
  scenarios: ScenarioConfig[];
  results: EngineScenarioResult[] | null;
  baselines: BaselineOutput[] | null;
  isRunning: boolean;
  error: string | null;

  setScenarios: (scenarios: ScenarioConfig[]) => void;
  setResults: (results: EngineScenarioResult[], baselines: BaselineOutput[]) => void;
  setIsRunning: (running: boolean) => void;
  setError: (error: string | null) => void;
  clearResults: () => void;
}

/**
 * 默认 6 方案配置：前 5 档为能量逻辑（PCS=0.5C），
 * 第 6 档为冲击负载功率逻辑（普通负载峰值 305kW + 3×泵额定 180kW = 845kW，BESS=2×PCS）
 * name 留空 → 显示层经 scenarioDisplayName() 按语言生成（指令⑨：英文模式零中文）
 */
export const DEFAULT_SCENARIOS: ScenarioConfig[] = [
  { id: 1, name: '', pvCapacity_kWp: 500, bessCapacity_kWh: 400, pcsPower_kW: 200 },
  { id: 2, name: '', pvCapacity_kWp: 500, bessCapacity_kWh: 600, pcsPower_kW: 300 },
  { id: 3, name: '', pvCapacity_kWp: 500, bessCapacity_kWh: 800, pcsPower_kW: 400 },
  { id: 4, name: '', pvCapacity_kWp: 500, bessCapacity_kWh: 1000, pcsPower_kW: 500 },
  { id: 5, name: '', pvCapacity_kWp: 500, bessCapacity_kWh: 1200, pcsPower_kW: 600 },
  { id: 6, name: '', pvCapacity_kWp: 500, bessCapacity_kWh: 1690, pcsPower_kW: 845 },
];

export const useSimulationStore = create<SimulationState>((set) => ({
  scenarios: DEFAULT_SCENARIOS,
  results: null,
  baselines: null,
  isRunning: false,
  error: null,

  setScenarios: (scenarios) => set({ scenarios }),
  setResults: (results, baselines) => set({ results, baselines, isRunning: false, error: null }),
  setIsRunning: (running) => set({ isRunning: running }),
  setError: (error) => set({ error, isRunning: false }),
  clearResults: () => set({ results: null, baselines: null, error: null }),
}));
