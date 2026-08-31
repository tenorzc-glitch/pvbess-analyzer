import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Tabs, Typography, Button, Space, Alert } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useProjectStore } from '../../store/useProjectStore';
import { useParamsStore } from '../../store/useParamsStore';
import { useSimulationStore } from '../../store/useSimulationStore';
import { useProfileStore } from '../../store/useProfileStore';
import { useSimulation } from '../../hooks/useSimulation';
import { useTranslation } from 'react-i18next';
import { CountryCode, ProfileData, AmbientTempData } from '../../types';
import { countryProfileRef, COUNTRY_PRESETS } from '../../data/countries';
import InputsPanel from '../inputs/InputsPanel';
import SizingPanel from '../sizing/SizingPanel';
import ResultsPanel from '../results/ResultsPanel';
import FinancePanel from '../finance/FinancePanel';
import ComparePanel from '../compare/ComparePanel';
import ReportPanel from '../report/ReportPanel';

const { Title } = Typography;

/** 通用工商业负荷模板（白班+晚峰，峰值 100kW 标幺；NASA 基线国不含负荷时注入） */
function genericLoadTemplate(slot: number): number {
  const h = slot / 4;
  if (h >= 8 && h < 18) return 100;  // 白班
  if (h >= 18 && h < 21) return 60;  // 晚峰
  if (h >= 6 && h < 8) return 40;    // 早班爬坡
  return 20;                          // 夜间基荷
}

/** 按国家加载辐照/气温基线（brazil 用实测 JSON，其余用 NASA 国家基线；
 * NASA 基线不含负荷/电价 → 注入通用工商业模板 + 国家预设电价） */
async function loadCountryProfile(country: CountryCode): Promise<{ profile: ProfileData | null; ambientTemp: AmbientTempData | null }> {
  try {
    const res = await fetch(countryProfileRef(country));
    const data = await res.json();
    let profile: ProfileData | null =
      data.profile && Array.isArray(data.profile) && data.profile.length === 12 ? data.profile : null;
    const ambientTemp: AmbientTempData | null =
      data.ambientTemp?.profile && Array.isArray(data.ambientTemp.profile) ? data.ambientTemp : null;

    // NASA 基线（load_kW 全 0）：注入通用工商业负荷 + 国家预设电价
    if (profile && country !== 'brazil') {
      const preset = COUNTRY_PRESETS[country];
      const peakP = preset?.grid.peakPrice_perkWh ?? 1.734;
      const offP = preset?.grid.offPeakPrice_perkWh ?? 0.748;
      profile = profile.map((month) =>
        month.map((iv, slot) => {
          const h = slot / 4;
          return {
            ...iv,
            load_kW: iv.load_kW > 0 ? iv.load_kW : genericLoadTemplate(slot),
            gridPrice: iv.gridPrice > 0 ? iv.gridPrice : (h >= 17.5 && h < 20.5 ? peakP : offP),
          };
        })
      );
    }
    return { profile, ambientTemp };
  } catch {
    return { profile: null, ambientTemp: null };
  }
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const projects = useProjectStore((s) => s.projects);
  const syncState = useProjectStore((s) => s.syncState);
  const updateProject = useProjectStore((s) => s.updateProject);
  const setParams = useParamsStore((s) => s.setParams);
  const params = useParamsStore((s) => s.params);
  const setScenarios = useSimulationStore((s) => s.setScenarios);
  const scenarios = useSimulationStore((s) => s.scenarios);
  const project = projects.find((p) => p.id === id);

  useSimulation();

  // 进入项目时：从云端数据初始化参数与方案配置 + 按国家加载辐照/气温基线
  useEffect(() => {
    if (project?.params && typeof project.params === 'object' && Object.keys(project.params).length > 0) {
      try { setParams(project.params as any); } catch { /* 数据异常时保持默认 */ }
    }
    if (project?.scenarios && Array.isArray(project.scenarios) && project.scenarios.length > 0) {
      try { setScenarios(project.scenarios as any); } catch { /* 保持默认 */ }
    }
    // 按项目国家加载对应辐照/气温基线（brazil=实测，其余=NASA 国家基线）
    const country = (project?.country ?? 'brazil') as CountryCode;
    loadCountryProfile(country).then(({ profile, ambientTemp }) => {
      if (profile) {
        // 数据源的电价为源币种（brazil=BRL；NASA=国家预设币种），
        // 若项目货币不同则按汇率表换算到项目币种——保持 params 与 profile 同币种
        const projParams = (project?.params ?? {}) as any;
        const projCode: string = projParams?.currency?.code ?? COUNTRY_PRESETS[country]?.currency.code ?? 'BRL';
        const srcCode: string = COUNTRY_PRESETS[country]?.currency.code ?? 'BRL';
        const rates: Record<string, number> = projParams?.exchangeRates ?? {};
        const factor = srcCode !== projCode ? (rates[srcCode] ?? 1) / (rates[projCode] ?? 1) : 1;
        const finalProfile = factor === 1 ? profile : profile.map((month) =>
          month.map((iv) => ({ ...iv, gridPrice: +(iv.gridPrice * factor).toFixed(6) }))
        );
        useProfileStore.getState().setProfile(finalProfile);
      }
      useProfileStore.getState().setAmbientTemp(ambientTemp);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  // 参数变更 debounce 500ms 落库
  useEffect(() => {
    if (!id) return;
    const timer = setTimeout(() => {
      updateProject(id, { params });
    }, 500);
    return () => clearTimeout(timer);
  }, [id, params, updateProject]);

  // 方案配置变更 debounce 落库
  useEffect(() => {
    if (!id) return;
    const timer = setTimeout(() => {
      updateProject(id, { scenarios });
    }, 500);
    return () => clearTimeout(timer);
  }, [id, scenarios, updateProject]);

  if (!project) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Title level={4}>{t('project.notFound')}</Title>
        <Button onClick={() => navigate('/')}>{t('project.back')}</Button>
      </div>
    );
  }

  const tabItems = [
    { key: 'inputs', label: t('nav.inputs'), children: <InputsPanel /> },
    { key: 'sizing', label: t('nav.sizing'), children: <SizingPanel /> },
    { key: 'results', label: t('nav.results'), children: <ResultsPanel /> },
    { key: 'finance', label: t('nav.finance'), children: <FinancePanel /> },
    { key: 'compare', label: t('nav.compare'), children: <ComparePanel /> },
    { key: 'report', label: t('nav.report'), children: <ReportPanel /> },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>
          {t('project.back')}
        </Button>
        <Title level={4} style={{ margin: 0 }}>{project.name}</Title>
      </Space>

      {syncState === 'offline' && (
        <Alert
          type="warning"
          showIcon
          message={t('sync.offline')}
          style={{ marginBottom: 16 }}
        />
      )}

      <Tabs defaultActiveKey="inputs" items={tabItems} />
    </div>
  );
}
