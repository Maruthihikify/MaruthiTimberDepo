import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_MTD_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_MTD_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(url && key)

export const supabase = createClient(url ?? 'https://invalid.supabase.co', key ?? 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'mtd-auth' },
  global: { headers: { 'x-client-info': 'maruthi-timber-depot' } },
})

/** Turns a Postgres/PostgREST error into the plain sentence our functions raise. */
export function errorText(e: unknown): string {
  if (!e) return 'Something went wrong'
  if (typeof e === 'string') return e
  const m = (e as { message?: string }).message ?? String(e)
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'No internet connection — please check and try again'
  if (/JWT expired|invalid JWT/i.test(m)) return 'Your session expired — please sign in again'
  return m
}

/** Calls an RPC and throws a readable Error on failure. */
export async function rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(errorText(error))
  return data as T
}

/** Unwraps a PostgREST response. */
export function must<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw new Error(errorText(res.error))
  return res.data as T
}
