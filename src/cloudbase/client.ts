import cloudbase from '@cloudbase/js-sdk';

/**
 * CloudBase 客户端单例。
 * 若未配置 VITE_CLOUDBASE_ENV_ID，则 isCloudBaseConfigured() 返回 false，
 * 应用回退到纯离线模式（localStorage）。
 */
export const envId: string | undefined = import.meta.env.VITE_CLOUDBASE_ENV_ID as string | undefined;

export const isCloudBaseConfigured = (): boolean => !!envId;

let _app: ReturnType<typeof cloudbase.init> | null = null;
let _auth: ReturnType<ReturnType<typeof cloudbase.init>['auth']> | null = null;
let _db: ReturnType<ReturnType<typeof cloudbase.init>['database']> | null = null;

export function getApp() {
  if (!envId) throw new Error('CloudBase 未配置（VITE_CLOUDBASE_ENV_ID 为空）');
  if (!_app) _app = cloudbase.init({ env: envId });
  return _app;
}

export function getAuth() {
  if (!_auth) _auth = getApp().auth({ persistence: 'local' });
  return _auth;
}

export function getDb() {
  if (!_db) _db = getApp().database();
  return _db;
}

/** 云函数：提升当前登录用户为管理员 */
export async function callPromoteAdmin(code: string) {
  const res = await getApp().callFunction({ name: 'promoteAdmin', data: { code } });
  return res?.result as { ok: boolean } | undefined;
}
