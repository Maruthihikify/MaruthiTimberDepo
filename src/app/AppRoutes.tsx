import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { useAuth, type Role } from '../lib/auth'
import { AppShell } from './AppShell'
import { PageLoader } from '../components/Loader'
import { Empty } from '../components/ui'
import { ShieldAlert } from 'lucide-react'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const SaleEditor = lazy(() => import('./pages/SaleEditor'))
const SalesList = lazy(() => import('./pages/SalesList'))
const DocView = lazy(() => import('./pages/DocView'))
const Deliveries = lazy(() => import('./pages/Deliveries'))
const Enquiries = lazy(() => import('./pages/Enquiries'))
const Stock = lazy(() => import('./pages/Stock'))
const LogYard = lazy(() => import('./pages/LogYard'))
const Sawmill = lazy(() => import('./pages/Sawmill'))
const SawmillNew = lazy(() => import('./pages/SawmillNew'))
const Purchases = lazy(() => import('./pages/Purchases'))
const PurchaseEditor = lazy(() => import('./pages/PurchaseEditor'))
const PurchaseView = lazy(() => import('./pages/PurchaseView'))
const Parties = lazy(() => import('./pages/Parties'))
const PartyView = lazy(() => import('./pages/PartyView'))
const Payments = lazy(() => import('./pages/Payments'))
const Expenses = lazy(() => import('./pages/Expenses'))
const Reports = lazy(() => import('./pages/Reports'))
const Tools = lazy(() => import('./pages/Tools'))
const Rates = lazy(() => import('./pages/Rates'))
const Products = lazy(() => import('./pages/Products'))
const Settings = lazy(() => import('./pages/Settings'))

function Guard({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { can } = useAuth()
  if (roles && !can(...roles)) return <Empty icon={<ShieldAlert className="size-7" />} title="Not available for your role" body="Ask the owner if you need access to this page." />
  return <>{children}</>
}

export default function AppRoutes() {
  const { session, profile, loading, signOut } = useAuth()
  if (!session && !loading) return <Navigate to="/login" replace />
  if (loading && !profile) return <PageLoader label="Opening the depot…" />
  if (session && !profile && !loading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas p-6">
        <div className="card max-w-md p-8 text-center">
          <p className="font-display text-xl font-semibold">This login is not set up as staff</p>
          <p className="mt-2 text-sm text-ink-soft">Ask the owner to add you from Settings → Team.</p>
          <button className="btn-ghost mt-5" onClick={() => signOut()}>Sign out</button>
        </div>
      </div>
    )
  }
  if (profile && !profile.active) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas p-6">
        <div className="card max-w-md p-8 text-center">
          <p className="font-display text-xl font-semibold">Your login is switched off</p>
          <p className="mt-2 text-sm text-ink-soft">Please speak to the owner.</p>
          <button className="btn-ghost mt-5" onClick={() => signOut()}>Sign out</button>
        </div>
      </div>
    )
  }
  const billing: Role[] = ['manager', 'accounts', 'sales']
  const money: Role[] = ['manager', 'accounts']
  return (
    <AppShell>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="sales" element={<SalesList />} />
          <Route path="sales/new" element={<Guard roles={billing}><SaleEditor /></Guard>} />
          <Route path="sales/:id" element={<DocView />} />
          <Route path="deliveries" element={<Deliveries />} />
          <Route path="enquiries" element={<Enquiries />} />
          <Route path="stock" element={<Stock />} />
          <Route path="logs" element={<LogYard />} />
          <Route path="sawmill" element={<Sawmill />} />
          <Route path="sawmill/new" element={<Guard roles={['manager', 'yard']}><SawmillNew /></Guard>} />
          <Route path="purchases" element={<Guard roles={money}><Purchases /></Guard>} />
          <Route path="purchases/new" element={<Guard roles={money}><PurchaseEditor /></Guard>} />
          <Route path="purchases/:id" element={<Guard roles={money}><PurchaseView /></Guard>} />
          <Route path="parties" element={<Guard roles={billing}><Parties /></Guard>} />
          <Route path="parties/:id" element={<Guard roles={billing}><PartyView /></Guard>} />
          <Route path="payments" element={<Guard roles={billing}><Payments /></Guard>} />
          <Route path="expenses" element={<Guard roles={money}><Expenses /></Guard>} />
          <Route path="reports" element={<Guard roles={money}><Reports /></Guard>} />
          <Route path="tools" element={<Tools />} />
          <Route path="rates" element={<Rates />} />
          <Route path="products" element={<Products />} />
          <Route path="settings" element={<Guard roles={[]}><Settings /></Guard>} />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  )
}
