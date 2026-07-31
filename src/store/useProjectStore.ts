import { create } from 'zustand';
import { Project } from '../types';
import { isCloudBaseConfigured, getDb } from '../cloudbase/client';

const CACHE_KEY = 'pv-bess-projects-cache';

export type SyncState = 'synced' | 'syncing' | 'offline' | 'error';

interface ProjectState {
  projects: Project[];
  currentProjectId: string | null;
  /** 云端同步状态（synced=已同步 / syncing=同步中 / offline=离线降级 / error=错误） */
  syncState: SyncState;
  /** 是否处于 CloudBase 在线模式 */
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

/** 从云端文档映射为本地 Project */
function mapDoc(d: any): Project {
  return {
    id: d._id,
    name: d.name || '未命名项目',
    country: d.country || 'brazil',
    description: d.description,
    createdAt: d.createdAt || new Date().toISOString(),
    updatedAt: d.updatedAt || new Date().toISOString(),
    status: d.status === 'complete' ? 'complete' : 'draft',
    params: d.params,
    scenarios: d.scenarios,
    owner: d._openid,
  };
}

/** 构造云端 payload（只持久化 params + scenarios，不含 id/owner） */
function buildPayload(p: Partial<Project>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (p.name !== undefined) payload.name = p.name;
  if (p.country !== undefined) payload.country = p.country;
  if (p.description !== undefined) payload.description = p.description;
  if (p.status !== undefined) payload.status = p.status;
  if (p.params !== undefined) payload.params = p.params;
  if (p.scenarios !== undefined) payload.scenarios = p.scenarios;
  payload.updatedAt = new Date().toISOString();
  return payload;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProjectId: null,
  syncState: 'synced',
  cloudMode: false,

  loadProjects: async () => {
    if (!isCloudBaseConfigured()) {
      const cached = readCache();
      set({ projects: cached, syncState: 'offline', cloudMode: false });
      return;
    }
    set({ syncState: 'syncing', cloudMode: true });
    try {
      const res = await getDb()
        .collection('projects')
        .orderBy('updatedAt', 'desc')
        .limit(100)
        .get();
      const docs = (res.data || []).map(mapDoc);
      set({ projects: docs, syncState: 'synced' });
      writeCache(docs);
    } catch {
      set({ projects: readCache(), syncState: 'offline' });
    }
  },

  setProjects: (projects) => set({ projects }),

  setCurrentProject: (id) => set({ currentProjectId: id }),

  addProject: async (project) => {
    if (!isCloudBaseConfigured()) {
      set((state) => ({ projects: [project, ...state.projects] }));
      writeCache(get().projects);
      return project;
    }
    try {
      const res = await getDb().collection('projects').add({
        ...buildPayload(project),
        createdAt: project.createdAt,
      });
      const cloudId = (res as any).id || (res as any)._id || project.id;
      const saved = { ...project, id: cloudId };
      set((state) => ({ projects: [saved, ...state.projects], syncState: 'synced' }));
      writeCache(get().projects);
      return saved;
    } catch {
      // 云端失败：降级本地保存
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
    if (!isCloudBaseConfigured()) {
      writeCache(get().projects);
      return;
    }
    try {
      await getDb().collection('projects').doc(id).update(buildPayload(updates));
    } catch {
      // 失败回滚
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
    if (!isCloudBaseConfigured()) {
      writeCache(get().projects);
      return;
    }
    try {
      await getDb().collection('projects').doc(id).remove();
    } catch {
      set({ projects: prev, syncState: 'offline' });
    }
  },
}));
