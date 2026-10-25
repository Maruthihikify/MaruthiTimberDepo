import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { LayoutDashboard, Layers, LogOut, Menu, Plus, Search, Users, X, ReceiptIndianRupee, ExternalLink } from 'lucide-react'
import { useAuth, ROLE_LABEL } from '../lib/auth'
import { plankUrlPersisted } from '../lib/wood'
import { initials } from '../lib/format'
import { NAV, allowed } from './nav'
import { CommandPalette } from './CommandPalette'

const SIDEBAR_TONE = { base: '#9A6236', grain: '#5E361B', rings: 5, figure: 0.5, pores: 0.3, chatoyance: 0.6, seed: 13 }

function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link to="/app" className="flex items-center gap-2.5">
      <img src="/brand/logo-256.webp" alt="" className="size-9 drop-shadow-[0_4px_10px_rgba(69,38,26,0.45)]" />
      <span className="leading-tight">
        <span className={`block font-display text-[17px] font-semibold ${light ? 'text-teak-50' : 'text-ink'}`}>Maruthi Timber</span>
        <span className={`block text-[10px] font-bold uppercase tracking-[0.22em] ${light ? 'text-teak-200' : 'text-teak-600'}`}>Depot · ERP</span>
      </span>
    </Link>
  )
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const { profile } = useAuth()
  return (
    <nav className="space-y-3.5">
      {NAV.map((g) => {
        const items = g.items.filter((i) => allowed(i, profile?.role))
        if (!items.length) return null
        return (
          <div key={g.group}>
            <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-teak-100/70">{g.group}</p>
            <ul className="space-y-0.5">
              {items.map((it) => (
                <li key={it.to}>
                  <NavLink
                    to={it.to}
                    end={it.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      `group relative flex items-center gap-3 rounded-xl px-3 py-[7px] text-[13.5px] font-semibold transition-colors ${isActive ? 'text-teak-900' : 'text-teak-50/90 hover:bg-white/10 hover:text-white'}`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#FFF4E2] to-[#F6DDB8] shadow-[0_6px_18px_-6px_rgba(40,20,8,0.55)]" transition={{ type: 'spring', stiffness: 480, damping: 38 }} />
                        )}
                        <it.icon className={`relative size-[18px] shrink-0 ${isActive ? 'text-teak-600' : 'text-teak-100/80 group-hover:text-white'}`} />
                        <span className="relative truncate">{it.label}</span>
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </nav>
  )
}

function WoodPanel({ children, className = '' }: { children: ReactNode; className?: string }) {
  const bg = useMemo(() => plankUrlPersisted('sidebar', SIDEBAR_TONE, 300, 1100, true), [])
  return (
    <div className={`relative ${className}`} style={{ backgroundImage: `url(${bg})`, backgroundSize: '100% auto', backgroundRepeat: 'repeat-y', backgroundColor: '#8A5530' }}>
      {/* soft varnish sheen + a little shade so cream text reads well on any grain */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#B87A45]/25 via-[#6E3F1E]/30 to-[#6E3F1E]/45" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-white/30 via-white/10 to-transparent" />
      <div className="relative flex h-full flex-col">{children}</div>
    </div>
  )
}

function UserCard() {
  const { profile, signOut } = useAuth()
  const nav = useNavigate()
  return (
    <div className="rounded-2xl bg-white/12 p-3 ring-1 ring-white/15 backdrop-blur-sm">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-sun-300 to-teak-400 text-sm font-bold text-teak-900">{initials(profile?.full_name)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">{profile?.full_name}</p>
          <p className="text-[11px] font-semibold text-teak-100/80">{profile ? ROLE_LABEL[profile.role] : ''}</p>
        </div>
        <button title="Sign out" onClick={async () => { await signOut(); nav('/login') }} className="grid size-8 place-items-center rounded-lg text-teak-100 hover:bg-white/15 hover:text-white">
          <LogOut className="size-4" />
        </button>
      </div>
    </div>
  )
}

const TITLES: [RegExp, string][] = [
  [/^\/app\/?$/, 'Dashboard'], [/^\/app\/sales\/new/, 'New bill'], [/^\/app\/sales\/[^/]+/, 'Bill'], [/^\/app\/sales/, 'Bills & quotations'],
  [/^\/app\/deliveries/, 'Deliveries'], [/^\/app\/enquiries/, 'Website enquiries'], [/^\/app\/stock/, 'Timber stock'], [/^\/app\/logs/, 'Log yard'],
  [/^\/app\/sawmill/, 'Sawmill'], [/^\/app\/purchases/, 'Purchases'], [/^\/app\/parties/, 'Customers & suppliers'], [/^\/app\/payments/, 'Receipts & payments'],
  [/^\/app\/expenses/, 'Expenses'], [/^\/app\/reports/, 'Reports & GST'], [/^\/app\/tools/, 'CFT calculator'], [/^\/app\/rates/, 'Species & rates'],
  [/^\/app\/products/, 'Products'], [/^\/app\/settings/, 'Settings'],
]

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, can } = useAuth()
  const loc = useLocation()
  const [drawer, setDrawer] = useState(false)
  const [palette, setPalette] = useState(false)
  const title = TITLES.find(([r]) => r.test(loc.pathname))?.[1] ?? ''

  useEffect(() => { setDrawer(false) }, [loc.pathname])
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true) }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])

  const canBill = can('manager', 'accounts', 'sales')

  return (
    <div className="min-h-dvh bg-canvas grain-bg">
      {/* desktop sidebar */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <WoodPanel className="h-full">
          <div className="px-5 pb-4 pt-5"><Brand light /></div>
          <div className="no-scrollbar flex-1 overflow-y-auto px-3 pb-4"><SideNav /></div>
          <div className="space-y-2 p-3">
            <Link to="/" target="_blank" className="flex items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-teak-100/80 hover:bg-white/10 hover:text-white"><ExternalLink className="size-3.5" /> View website</Link>
            <UserCard />
          </div>
        </WoodPanel>
      </aside>

      {/* mobile drawer */}
      <AnimatePresence>
        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div className="absolute inset-0 bg-teak-900/40 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawer(false)} />
            <motion.aside className="absolute inset-y-0 left-0 w-[82%] max-w-[300px] shadow-lift" initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', stiffness: 380, damping: 38 }}>
              <WoodPanel className="h-full">
                <div className="flex items-center justify-between px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
                  <Brand light />
                  <button onClick={() => setDrawer(false)} className="grid size-9 place-items-center rounded-xl text-teak-50 hover:bg-white/10" aria-label="Close menu"><X className="size-5" /></button>
                </div>
                <div className="flex-1 overflow-y-auto px-3 pb-3"><SideNav onNavigate={() => setDrawer(false)} /></div>
                <div className="p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"><UserCard /></div>
              </WoodPanel>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="lg:pl-64">
        {/* top bar */}
        <header className="no-print sticky top-0 z-20 border-b border-line/70 bg-canvas/80 backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-[1500px] items-center gap-2 px-3 sm:h-16 sm:px-6">
            <button className="grid size-10 place-items-center rounded-xl text-ink hover:bg-teak-50 lg:hidden" onClick={() => setDrawer(true)} aria-label="Open menu"><Menu className="size-5" /></button>
            <div className="lg:hidden"><img src="/brand/logo-256.webp" alt="" className="size-7" /></div>
            <AnimatePresence mode="wait">
              <motion.p key={title} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}
                className="min-w-0 truncate font-display text-lg font-semibold text-ink sm:hidden">{title}</motion.p>
            </AnimatePresence>
            <button onClick={() => setPalette(true)} className="ml-auto flex h-10 items-center gap-2 rounded-xl border border-line bg-paper px-3 text-sm text-ink-mute shadow-sm transition hover:border-teak-300 sm:ml-0 sm:w-80">
              <Search className="size-4" /><span className="hidden sm:inline">Search bills, parties, sizes…</span>
              <kbd className="ml-auto hidden rounded-md border border-line bg-cream px-1.5 text-[10px] font-bold text-ink-soft sm:inline">Ctrl K</kbd>
            </button>
            <div className="ml-auto hidden items-center gap-2 sm:flex">
              {canBill && <Link to="/app/sales/new" className="btn-primary"><Plus className="size-4" /> New bill</Link>}
              <span className="hidden text-right leading-tight xl:block">
                <span className="block text-sm font-bold">{profile?.full_name}</span>
                <span className="block text-[11px] font-semibold text-ink-soft">{profile ? ROLE_LABEL[profile.role] : ''}</span>
              </span>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1500px] px-3 pb-28 pt-4 sm:px-6 sm:pt-6 lg:pb-12">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={loc.pathname} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}>
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* phone bottom bar */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 items-end px-2">
          {[
            { to: '/app', icon: LayoutDashboard, label: 'Home', end: true },
            { to: '/app/stock', icon: Layers, label: 'Stock' },
          ].map((i) => <BottomLink key={i.to} {...i} />)}
          <div className="flex justify-center">
            {canBill ? (
              <Link to="/app/sales/new" aria-label="New bill" className="-mt-5 grid size-14 place-items-center rounded-2xl text-white shadow-glow" style={{ background: 'linear-gradient(135deg,#dc9140,#a95e1f)' }}>
                <ReceiptIndianRupee className="size-6" />
              </Link>
            ) : <BottomLink to="/app/sawmill" icon={Layers} label="Sawmill" />}
          </div>
          <BottomLink to={can('manager', 'accounts', 'sales') ? '/app/parties' : '/app/logs'} icon={Users} label={can('manager', 'accounts', 'sales') ? 'Parties' : 'Logs'} />
          <button onClick={() => setDrawer(true)} className="flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-bold text-ink-soft"><Menu className="size-5" />More</button>
        </div>
      </nav>

      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  )
}

function BottomLink({ to, icon: Icon, label, end }: { to: string; icon: typeof Menu; label: string; end?: boolean }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-bold transition-colors ${isActive ? 'text-teak-600' : 'text-ink-soft'}`}>
      <Icon className="size-5" />
      {label}
    </NavLink>
  )
}
