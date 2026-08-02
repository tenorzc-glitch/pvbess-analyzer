import { create } from 'zustand';
import { Project } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const CACHE_KEY = 'pv-bess-projects-cache';

export type SyncState = 'synced' | 'syncing' | 'offline' | 'error';

interface ProjectState {
  projects: Project[];
  currentProjectId: string | null;
  syncState: SyncState;
  cloudMode: boolean;
  loadProjects: () => Promise<void>;
  setProjects: (projects: Project[]) => void;
  setCurrentProject: (id: string | null) => void;
  addProject: (project: Project) => Promise<Project>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
}

function readCache(): Project[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function writeCache(projects: Project[]) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(projects)); } catch { /* ignore */ }
}

/** 从 Supabase 行映射为本地 Project（snake_case → camelCase） */
function mapRow(row: any): Project {
  return {
    id: row.id,
    name: row.name || '未命名项目',
    country: row.country || 'brazil',
    description: row.description,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
    status: row.status === 'complete' ? 'complete' : 'draft',
    params: row.params,
    scenarios: row.scenarios,
    owner: row.user_id,
  };
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProjectId: null,
  syncState: 'synced',
  cloudMode: false,

  loadProjects: async () => {
    if (!isSupabaseConfigured() || !supabase) {
      const cached = readCache();
      set({ projects: cached, syncState: 'offline', cloudMode: false });
      return;
    }
    set({ syncState: 'syncing', cloudMode: true });
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      const projects = (data || []).map(mapRow);
      set({ projects, syncState: 'synced' });
      writeCache(projects);
    } catch {
      set({ projects: readCache(), syncState: 'offline' });
    }
  },

  setProjects: (projects) => set({ projects }),

  setCurrentProject: (id) => set({ currentProjectId: id }),

  addProject: async (project) => {
    if (!isSupabaseConfigured() || !supabase) {
      set((state) => ({ projects: [project, ...state.projects] }));
      writeCache(get().projects);
      return project;
    }
    try {
      // 获取当前登录用户 ID（RLS 策略要求 user_id 匹配 auth.uid()）
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) throw new Error('未登录');
      const { data, error } = await supabase.from('projects').insert({
        name: project.name,
        country: project.country,
        description: project.description,
        status: project.status,
        params: project.params || {},
        scenarios: project.scenarios || null,
        user_id: currentUser.id,
      }).select().single();
      if (error) throw error;
      const saved = mapRow(data);
      set((state) => ({ projects: [saved, ...state.projects], syncState: 'synced' }));
      writeCache(get().projects);
      return saved;
    } catch {
      set((state) => ({ projects: [project, ...state.projects], syncState: 'offline' }));
      writeCache(get().projects);
      return project;
    }
  },

  updateProject: async (id, updates) => {
    // 乐观更新
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
      ),
    }));
    if (!isSupabaseConfigured() || !supabase) {
      writeCache(get().projects);
      return;
    }
    try {
      const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (updates.name !== undefined) payload.name = updates.name;
      if (updates.country !== undefined) payload.country = updates.country;
      if (updates.description !== undefined) payload.description = updates.description;
      if (updates.status !== undefined) payload.status = updates.status;
      if (updates.params !== undefined) payload.params = updates.params;
      if (updates.scenarios !== undefined) payload.scenarios = updates.scenarios;
      const { error } = await supabase.from('projects').update(payload).eq('id', id);
      if (error) throw error;
    } catch {
      set({ syncState: 'offline' });
      writeCache(get().projects);
    }
  },

  deleteProject: async (id) => {
    const prev = get().projects;
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      currentProjectId: state.currentProjectId === id ? null : state.currentProjectId,
    }));
    if (!isSupabaseConfigured() || !supabase) {
      writeCache(get().projects);
      return;
    }
    try {
      const { error } = await supabase.from('projects').delete().eq('id', id);
      if (error) throw error;
    } catch {
      set({ projects: prev, syncState: 'offline' });
    }
  },
}));
