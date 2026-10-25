// Query hooks. Masters are cached long (they rarely change); transactions refresh on focus and after every save.
import { useQuery } from '@tanstack/react-query'
import { must, rpc, supabase } from '../lib/supabase'
import type { CompanySettings, Dashboard, Log, PartyBalance, Party, Product, SawnStockRow, Species } from './types'

const MIN = 60_000

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => must(await supabase.from('company_settings').select('*').eq('id', 1).single()) as CompanySettings,
    staleTime: 10 * MIN,
  })
}

export function useSpecies() {
  return useQuery({
    queryKey: ['species'],
    queryFn: async () => must(await supabase.from('species').select('*').order('sort_order').order('name')) as Species[],
    staleTime: 5 * MIN,
  })
}

export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: async () => must(await supabase.from('products').select('*').order('kind').order('name')) as Product[],
    staleTime: MIN,
  })
}

export function useParties() {
  return useQuery({
    queryKey: ['parties'],
    queryFn: async () => must(await supabase.from('parties').select('*').order('name')) as Party[],
    staleTime: MIN,
  })
}

export function useBalances() {
  return useQuery({
    queryKey: ['balances'],
    queryFn: async () => must(await supabase.from('v_party_balances').select('*').order('name')) as PartyBalance[],
  })
}

export function useSawnStock() {
  return useQuery({
    queryKey: ['stock', 'sawn'],
    queryFn: async () => must(await supabase.from('v_sawn_stock').select('*').order('species_name').order('thickness_in', { ascending: false }).order('width_in', { ascending: false }).order('length_ft')) as SawnStockRow[],
  })
}

export function useYardLogs() {
  return useQuery({
    queryKey: ['logs', 'yard'],
    queryFn: async () => must(await supabase.from('logs').select('*, species(name,color_hex,grain_hex,log_rate_cft)').eq('status', 'in_yard').order('received_on').order('log_no')) as Log[],
  })
}

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => rpc<Dashboard>('dashboard_snapshot'),
    refetchInterval: 2 * MIN,
  })
}

export const speciesMap = (list?: Species[]) => new Map((list ?? []).map((s) => [s.id, s]))
export const productMap = (list?: Product[]) => new Map((list ?? []).map((p) => [p.id, p]))
