import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectStore } from './store/useProjectStore';
import { useProfileStore } from './store/useProfileStore';
import { useAuth } from './hooks/useAuth';
import { ProfileData, AmbientTempData } from './types';
import i18n from './i18n';

/** 演示项目的历史名称（用于自动重命名迁移） */
const LEGACY_DEMO_NAMES = ['巴西咖啡农场 500kWp', 'Brazil Coffee Farm 500kWp'];

/** 初始化：加载项目列表 + profile 数据 */
export default function AutoInit() {
  const navigate = useNavigate();
  const { loadProjects } = useProjectStore();
  const { setProfile, setAmbientTemp } = useProfileStore();
  const { user } = useAuth();

  useEffect(() => {
    loadProjects().then(() => {
      const { projects, cloudMode } = useProjectStore.getState();
      if (!cloudMode && projects.length === 0) {
        // 离线模式且无任何项目时，创建默认演示项目
        const project = {
          id: 'default-brazil',
          name: i18n.t('common.demoProjectName'),
          country: 'brazil' as const,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'draft' as const,
        };
        useProjectStore.getState().addProject(project);
        navigate('/project/default-brazil');
      } else {
        // 旧名迁移：演示项目若还叫旧名字（中英文历史文案），统一改为新名称
        const demo = projects.find((p) => p.id === 'default-brazil');
        if (demo && LEGACY_DEMO_NAMES.includes(demo.name)) {
          useProjectStore.getState().updateProject('default-brazil', { name: i18n.t('common.demoProjectName') });
        }
      }
    });

    // 加载 profile + 气温（仅数据层）
    loadProfileWithTemp().then(({ profile, ambientTemp }) => {
      setProfile(profile);
      setAmbientTemp(ambientTemp);
    }).catch(() => {
      setProfile(builtinProfile());
      setAmbientTemp(null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, i18n.language]);

  return null;
}

async function loadProfileWithTemp(): Promise<{ profile: ProfileData; ambientTemp: AmbientTempData | null }> {
  // 尝试从测试数据加载
  try {
    const res = await fetch('/data/brazil_test_data.json');
    const data = await res.json();
    const profile: ProfileData | null =
      data.profile && Array.isArray(data.profile) && data.profile.length === 12
        ? data.profile
        : null;
    const ambientTemp: AmbientTempData | null =
      data.ambientTemp && Array.isArray(data.ambientTemp.profile) && data.ambientTemp.profile.length === 12
        ? data.ambientTemp
        : null;
    if (profile) return { profile, ambientTemp };
  } catch { /* fall through */ }
  return { profile: builtinProfile(), ambientTemp: null };
}

function builtinProfile(): ProfileData {
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const profile: ProfileData = [];
  for (let m = 0; m < 12; m++) {
    const monthData = [];
    for (let t = 0; t < 96; t++) {
      const hour = t / 4;
      let load = 55;
      if (hour >= 6 && hour < 8) load = 75;
      if (hour >= 8 && hour < 18) load = 90;
      if (hour >= 18 && hour < 20) load = 60;
      let pv = 0;
      const solarHour = hour - 6;
      if (solarHour > 0 && solarHour < 12) {
        pv = Math.sin((solarHour / 12) * Math.PI) * 0.85;
      }
      monthData.push({
        load_kW: load,
        pvPerUnit: pv,
        gridAvailable: true,
        gridPrice: 0.748,
        daysInMonth: days[m],
      });
    }
    profile.push(monthData);
  }
  return profile;
}
