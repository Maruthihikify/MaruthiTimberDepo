import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { persister, queryClient } from './lib/queryClient'
import { AuthProvider } from './lib/auth'
import { Toaster } from './components/Toast'
import { PageLoader } from './components/Loader'

// Each area is its own download: website visitors never fetch the ERP, staff never fetch the website's media.
const Landing = lazy(() => import('./landing/Landing'))
const Login = lazy(() => import('./app/Login'))
const AppRoutes = lazy(() => import('./app/AppRoutes'))

export default function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 12,
        buster: 'mtd-v1',
        dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === 'success' && q.meta?.persist !== false },
      }}
    >
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/app/*" element={<AppRoutes />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
          <Toaster />
        </AuthProvider>
      </BrowserRouter>
    </PersistQueryClientProvider>
  )
}
