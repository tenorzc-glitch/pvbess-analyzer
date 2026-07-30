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

/** 默认 5 方案配置 */
export const DEFAULT_SCENARIOS: ScenarioConfig[] = [
  { id: 1, name: '方案1 (400kWh)', pvCapacity_kWp: 500, bessCapacity_kWh: 400, pcsPower_kW: 200 },
  { id: 2, name: '方案2 (600kWh)', pvCapacity_kWp: 500, bessCapacity_kWh: 600, pcsPower_kW: 300 },
  { id: 3, name: '方案3 (800kWh)', pvCapacity_kWp: 500, bessCapacity_kWh: 800, pcsPower_kW: 400 },
  { id: 4, name: '方案4 (1000kWh)', pvCapacity_kWp: 500, bessCapacity_kWh: 1000, pcsPower_kW: 500 },
  { id: 5, name: '方案5 (1200kWh)', pvCapacity_kWp: 500, bessCapacity_kWh: 1200, pcsPower_kW: 600 },
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
