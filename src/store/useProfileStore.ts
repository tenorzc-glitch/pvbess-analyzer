import { create } from 'zustand';
import { ProfileData, ProfileMeta, AmbientTempData } from '../types';

interface ProfileState {
  profile: ProfileData | null;
  profiles: ProfileMeta[];
  /** 室外气温（仅数据层，未接入引擎） */
  ambientTemp: AmbientTempData | null;
  setProfile: (profile: ProfileData) => void;
  setProfiles: (profiles: ProfileMeta[]) => void;
  setAmbientTemp: (data: AmbientTempData | null) => void;
  clearProfile: () => void;
}

export const useProfileStore = create<ProfileState>((set) => ({
  profile: null,
  profiles: [],
  ambientTemp: null,

  setProfile: (profile) => set({ profile }),
  setProfiles: (profiles) => set({ profiles }),
  setAmbientTemp: (data) => set({ ambientTemp: data }),
  clearProfile: () => set({ profile: null }),
}));
