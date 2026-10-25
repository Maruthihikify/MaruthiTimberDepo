import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { queryClient } from './queryClient'

export type Role = 'owner' | 'manager' | 'accounts' | 'sales' | 'yard'

export interface Profile {
  id: string
  full_name: string
  phone: string | null
  login_email: string | null
  role: Role
  active: boolean
}

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  signIn: (login: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  can: (...roles: Role[]) => boolean
}

const Ctx = createContext<AuthState | null>(null)

/** Staff sign in with a user name or 10-digit mobile number; both map to the login e-mail created for them. */
export const STAFF_DOMAIN = 'staff.maruthitimber.in'
export function loginToEmail(login: string) {
  const t = login.trim().toLowerCase()
  if (t.includes('@')) return t
  const digits = t.replace(/[\s+\-()]/g, '')
  if (/^(91)?[6-9]\d{9}$/.test(digits)) return `${digits.slice(-10)}@${STAFF_DOMAIN}`
  return `${t.replace(/[^a-z0-9._-]/g, '')}@${STAFF_DOMAIN}`
}

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner',
  manager: 'Manager',
  accounts: 'Accounts',
  sales: 'Billing counter',
  yard: 'Yard & sawmill',
}

const PROFILE_KEY = 'mtd-profile'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(() => {
    try { return JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null') } catch { return null }
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setSession(data.session)
      if (!data.session) { setProfile(null); setLoading(false) }
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (!s) {
        setProfile(null)
        try { localStorage.removeItem(PROFILE_KEY) } catch { /* ignore */ }
      }
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!session) return
    let alive = true
    supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle().then(({ data }) => {
      if (!alive) return
      setProfile((data as Profile | null) ?? null)
      try { localStorage.setItem(PROFILE_KEY, JSON.stringify(data ?? null)) } catch { /* ignore */ }
      setLoading(false)
    })
    return () => { alive = false }
  }, [session])

  const value = useMemo<AuthState>(() => ({
    session,
    profile,
    loading,
    async signIn(login, password) {
      const { error } = await supabase.auth.signInWithPassword({ email: loginToEmail(login), password })
      if (error) throw new Error(/invalid/i.test(error.message) ? 'Wrong mobile/e-mail or password' : error.message)
    },
    async signOut() {
      await supabase.auth.signOut()
      queryClient.clear()
      try { localStorage.removeItem('mtd-cache'); localStorage.removeItem(PROFILE_KEY) } catch { /* ignore */ }
    },
    can: (...roles) => !!profile && profile.active && (profile.role === 'owner' || roles.includes(profile.role)),
  }), [session, profile, loading])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth outside AuthProvider')
  return v
}
