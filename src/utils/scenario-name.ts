/** 场景显示名：用户自定义名优先；默认名经 i18n 模板生成（避免英文模式残留中文） */
import { TFunction } from 'i18next';
import { ScenarioConfig } from '../types';

export function scenarioDisplayName(s: ScenarioConfig, t: TFunction): string {
  if (s.name) return s.name;
  return s.id === 6
    ? t('scenario.names.shock', { n: s.id, bess: s.bessCapacity_kWh })
    : t('scenario.names.template', { n: s.id, bess: s.bessCapacity_kWh });
}
