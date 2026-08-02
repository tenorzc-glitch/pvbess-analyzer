import { createClient } from '@supabase/supabase-js';

/**
 * Supabase 客户端单例。
 * 若未配置 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY，则 supabase 为 null，
 * 应用回退到纯离线模式（localStorage）。
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase = url && anonKey ? createClient(url, anonKey) : null;

export const isSupabaseConfigured = (): boolean => !!supabase;
