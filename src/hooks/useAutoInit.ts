import { useEffect } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { useProfileStore } from '../store/useProfileStore';
import { useParamsStore } from '../store/useParamsStore';
import { ProfileData } from '../types';

/** 自动加载测试数据和默认项目 */
export function useAutoInit() {
  const { projects, addProject, setCurrentProject } = useProjectStore();
  const { setProfile } = useProfileStore();

  useEffect(() => {
    // 如果没有项目，创建一个默认巴西项目
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
      setCurrentProject('default-brazil');
    }
  }, []);

  useEffect(() => {
    // 加载测试 profile 数据
    fetch('/src/data/brazil_test_data.json')
      .then(res => res.json())
      .then(data => {
        if (data.profile) {
          setProfile(data.profile as ProfileData);
        }
      })
      .catch(err => {
        console.warn('无法加载测试数据，使用内置 profile:', err);
        // 加载内置简洁版
        loadBuiltinProfile().then(setProfile);
      });
  }, []);
}

/** 生成内置简化版 profile */
async function loadBuiltinProfile(): Promise<ProfileData> {
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const profile: ProfileData = [];

  for (let m = 0; m < 12; m++) {
    const monthData = [];
    for (let t = 0; t < 96; t++) {
      const hour = t / 4;
      // 简化的负荷曲线：基础 55kW + 水泵时段
      let load = 55;
      if (hour >= 6 && hour < 8) load = 75;
      if (hour >= 8 && hour < 18) load = 90;
      if (hour >= 18 && hour < 20) load = 60;

      // 简化的光伏标幺曲线
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
