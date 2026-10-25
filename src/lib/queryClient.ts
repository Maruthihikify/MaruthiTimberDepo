import { QueryClient } from '@tanstack/react-query'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'

// Screens open instantly from the last-known data (kept for 12 h) and refresh in the background.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 1000 * 60 * 60 * 12,
      refetchOnWindowFocus: true,
      retry: (count, err) => count < 2 && !/permission|not allowed|sign in/i.test(String((err as Error)?.message)),
    },
    mutations: { retry: 0 },
  },
})

function safeStorage(): Storage | undefined {
  try {
    const s = window.localStorage
    s.setItem('mtd-probe', '1')
    s.removeItem('mtd-probe')
    return s
  } catch {
    return undefined
  }
}

export const persister = createSyncStoragePersister({
  storage: typeof window === 'undefined' ? undefined : safeStorage(),
  key: 'mtd-cache',
  throttleTime: 1500,
})

/** Refresh everything a stock or money transaction can change. */
export function invalidateBusiness() {
  for (const k of ['dashboard', 'stock', 'sales', 'purchases', 'parties', 'payments', 'logs', 'conversions', 'reports', 'products', 'deliveries', 'enquiries', 'party', 'doc', 'balances']) {
    void queryClient.invalidateQueries({ queryKey: [k] })
  }
}
