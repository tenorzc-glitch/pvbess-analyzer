/**
 * 纯离线模式：无需 Supabase
 * 数据通过 localStorage + JSON 文件导入/导出管理
 */
export function isSupabaseConfigured(): boolean {
  return false;
}
