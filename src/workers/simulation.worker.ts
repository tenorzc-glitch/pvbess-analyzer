/**
 * Web Worker: 调度仿真
 * 在独立线程中运行所有方案的仿真计算，避免阻塞 UI
 */

import { runAllSimulations } from '../engine/simulation-engine';
import { EngineInput, EngineOutput } from '../engine/types';

self.onmessage = (e: MessageEvent<EngineInput>) => {
  const { params, scenarios, profile } = e.data;

  try {
    const result = runAllSimulations(params, scenarios, profile);
    const output: EngineOutput = {
      scenarioResults: result.scenarioResults,
      baselines: result.baselines,
    };
    self.postMessage({ type: 'success', data: output });
  } catch (error: any) {
    self.postMessage({ type: 'error', message: error.message });
  }
};
