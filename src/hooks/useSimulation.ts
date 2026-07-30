import { useCallback, useEffect, useRef } from 'react';
import { useParamsStore } from '../store/useParamsStore';
import { useProfileStore } from '../store/useProfileStore';
import { useSimulationStore } from '../store/useSimulationStore';
import { useFinanceStore } from '../store/useFinanceStore';
import { runAllSimulations } from '../engine/simulation-engine';
import { computeAllFinance } from '../engine/financial-engine';

/**
 * 仿真计算 Hook
 * 当参数或 Profile 变化时，自动触发仿真和财务计算（debounce 500ms）
 */
export function useSimulation() {
  const params = useParamsStore((s) => s.params);
  const profile = useProfileStore((s) => s.profile);
  const scenarios = useSimulationStore((s) => s.scenarios);
  const { setResults, setIsRunning, setError } = useSimulationStore();
  const { setResults: setFinanceResults, setIsRunning: setFinanceRunning } = useFinanceStore();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(() => {
    if (!profile || !profile.length) return;

    setIsRunning(true);
    setFinanceRunning(true);

    // 使用 setTimeout 而不是 Web Worker，保持代码简单
    // 后续可替换为 Worker
    timerRef.current = setTimeout(() => {
      try {
        const simOutput = runAllSimulations(params, scenarios, profile);
        setResults(simOutput.scenarioResults, simOutput.baselines);

        const financeResults = computeAllFinance(
          params, scenarios,
          simOutput.scenarioResults,
          simOutput.baselines
        );
        setFinanceResults(financeResults);
      } catch (err: any) {
        setError(err.message || '仿真计算失败');
      }
    }, 100);
  }, [params, profile, scenarios, setResults, setFinanceResults, setIsRunning, setFinanceRunning, setError]);

  // 参数变化时触发计算
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(run, 500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [run]);

  return { run };
}
