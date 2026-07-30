import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectStore } from './store/useProjectStore';
import { useProfileStore } from './store/useProfileStore';
import { ProfileData } from './types';

/** 初始化：创建默认项目 + 加载 profile 数据 */
export default function AutoInit() {
  const navigate = useNavigate();
  const { projects, addProject } = useProjectStore();
  const { setProfile } = useProfileStore();

  useEffect(() => {
    if (projects.length === 0) {
      const project = {
        id: 'default-brazil',
        name: '巴西咖啡农场 500kWp',
        country: 'brazil' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'draft' as const,
      };
      addProject(project);
      navigate('/project/default-brazil');
    }

    // 加载 profile
    loadProfile().then(setProfile).catch(() => {
      setProfile(builtinProfile());
    });
  }, []);

  return null;
}

async function loadProfile(): Promise<ProfileData> {
  // 尝试从测试数据加载
  try {
    const res = await fetch('/data/brazil_test_data.json');
    const data = await res.json();
    if (data.profile && Array.isArray(data.profile) && data.profile.length === 12) {
      return data.profile;
    }
  } catch { /* fall through */ }
  return builtinProfile();
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
        gridPrice: 0.65,
        daysInMonth: days[m],
      });
    }
    profile.push(monthData);
  }
  return profile;
}
