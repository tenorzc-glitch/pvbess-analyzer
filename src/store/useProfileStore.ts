import { create } from 'zustand';
import { ProfileData, ProfileMeta } from '../types';

interface ProfileState {
  profile: ProfileData | null;
  profiles: ProfileMeta[];
  setProfile: (profile: ProfileData) => void;
  setProfiles: (profiles: ProfileMeta[]) => void;
  clearProfile: () => void;
}

export const useProfileStore = create<ProfileState>((set) => ({
  profile: null,
  profiles: [],

  setProfile: (profile) => set({ profile }),
  setProfiles: (profiles) => set({ profiles }),
  clearProfile: () => set({ profile: null }),
}));
