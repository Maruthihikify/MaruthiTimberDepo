import { useQuery } from '@tanstack/react-query'
import { rpc, supabaseConfigured } from '../lib/supabase'

export type Availability = 'in_stock' | 'limited' | 'on_order'

export interface PublicSpecies {
  id: string
  name: string
  local_name: string | null
  botanical_name: string | null
  origin: string | null
  category: 'hardwood' | 'softwood' | 'imported' | 'plantation'
  density: number | null
  durability: string | null
  uses: string | null
  description: string | null
  color: string
  grain: string
  sawn_cft: number
  log_cft: number
  sizes: number
  availability: Availability
  rate_from: number | null
}

export interface PublicCompany {
  name: string
  tagline: string | null
  address: string | null
  city: string | null
  state: string | null
  pincode: string | null
  phone: string | null
  alt_phone: string | null
  whatsapp: string | null
  email: string | null
  opening_hours: string | null
  map_query: string | null
  gstin: string | null
  show_prices: boolean
}

export interface Catalog {
  company: PublicCompany
  totals: { sawn_cft: number; log_cft: number; logs: number; sizes: number; species: number }
  species: PublicSpecies[]
}

const sp = (
  id: string, name: string, local: string, bot: string, origin: string, category: PublicSpecies['category'],
  density: number, durability: string, uses: string, color: string, grain: string,
): PublicSpecies => ({
  id, name, local_name: local, botanical_name: bot, origin, category, density, durability, uses, description: null,
  color, grain, sawn_cft: 0, log_cft: 0, sizes: 0, availability: 'on_order', rate_from: null,
})

/** Shown until the yard's live list loads (or if it cannot load). Facts are typical trade values. */
export const FALLBACK_SPECIES: PublicSpecies[] = [
  sp('f-ghana', 'Ghana Teak', 'Saguvani', 'Tectona grandis', 'Ghana, West Africa', 'imported', 650, 'Very durable', 'Door frames, windows, furniture', '#C08A4E', '#6E4421'),
  sp('f-burma', 'Burma Teak', 'Saguvani', 'Tectona grandis', 'Myanmar', 'imported', 680, 'Exceptionally durable, naturally oily', 'Main doors, premium furniture, carving', '#B98043', '#5E3A1B'),
  sp('f-nilambur', 'Nilambur Teak', 'Saguvani', 'Tectona grandis', 'Nilambur, Kerala', 'hardwood', 660, 'Very durable, golden', 'Pooja rooms, main doors, panelling', '#C9934F', '#6E4421'),
  sp('f-sal', 'Sal', 'Sal', 'Shorea robusta', 'Central India', 'hardwood', 870, 'Very durable, heavy', 'Door frames (chowkat), beams, posts', '#9C5F3A', '#5C301B'),
  sp('f-honne', 'Honne', 'Honne', 'Pterocarpus marsupium', 'Western Ghats, Karnataka', 'hardwood', 800, 'Durable, termite resistant', 'Door & window frames, furniture', '#B4552F', '#6E2814'),
  sp('f-rose', 'Rosewood', 'Beete', 'Dalbergia latifolia', 'Karnataka & Kerala', 'hardwood', 850, 'Very durable', 'Premium furniture, carving, inlay', '#6A3426', '#2E1410'),
  sp('f-matti', 'Matti', 'Matti', 'Terminalia elliptica', 'Karnataka forests', 'hardwood', 860, 'Durable when seasoned', 'Rafters, beams, frames', '#8C6B4F', '#4F3A29'),
  sp('f-jack', 'Jackfruit', 'Halasu', 'Artocarpus heterophyllus', 'Coastal Karnataka', 'hardwood', 600, 'Moderate, ages to deep amber', 'Pooja doors, furniture, instruments', '#D59A3D', '#9A5E1C'),
  sp('f-silver', 'Silver Oak', 'Silver Oak', 'Grevillea robusta', 'Coorg & Chikmagalur estates', 'plantation', 560, 'Moderate', 'Furniture, shelving, rafters', '#C9A27E', '#8C6448'),
  sp('f-pine', 'Pine', 'Pine', 'Pinus radiata', 'New Zealand (imported)', 'softwood', 500, 'Treated for durability', 'Interiors, rafters, packing, shuttering', '#E6C48E', '#B47A3C'),
  sp('f-mango', 'Mango', 'Maavu', 'Mangifera indica', 'Local farms', 'plantation', 630, 'Moderate (treated)', 'Furniture, shuttering, packing', '#C9A57A', '#7F5E3C'),
  sp('f-neem', 'Neem', 'Bevu', 'Azadirachta indica', 'Local', 'hardwood', 720, 'Naturally insect repellent', 'Furniture, frames, carts', '#B5774C', '#734325'),
]

const FALLBACK: Catalog = {
  company: {
    name: 'Maruthi Timber Depot', tagline: 'Seasoned timber · Sawmill · Doors & frames', address: null, city: null,
    state: 'Karnataka', pincode: null, phone: null, alt_phone: null, whatsapp: null, email: null,
    opening_hours: 'Mon–Sat 8:30 AM – 7:30 PM · Sun 9 AM – 1 PM', map_query: null, gstin: null, show_prices: false,
  },
  totals: { sawn_cft: 0, log_cft: 0, logs: 0, sizes: 0, species: FALLBACK_SPECIES.length },
  species: FALLBACK_SPECIES,
}

/** The public catalogue: company details + live availability. Never throws — falls back to defaults. */
export function useCatalog() {
  const q = useQuery({
    queryKey: ['public-catalog'],
    queryFn: async () => {
      if (!supabaseConfigured) return FALLBACK
      const c = await rpc<Catalog>('public_catalog')
      return c
    },
    staleTime: 60_000,
    meta: { persist: true },
  })
  const live = q.data
  const species = live?.species?.length ? live.species : FALLBACK_SPECIES
  return {
    loading: q.isLoading,
    live: Boolean(live?.species?.length),
    company: { ...FALLBACK.company, ...(live?.company ?? {}) } as PublicCompany,
    totals: live?.totals ?? FALLBACK.totals,
    species,
  }
}

export const AVAILABILITY: Record<Availability, { label: string; cls: string; dot: string }> = {
  in_stock: { label: 'In stock', cls: 'bg-leaf-50 text-leaf-700 ring-1 ring-leaf-200', dot: 'bg-leaf-500' },
  limited: { label: 'Limited', cls: 'bg-sun-100 text-sun-500 ring-1 ring-sun-300', dot: 'bg-sun-400' },
  on_order: { label: 'On order', cls: 'bg-sky-50 text-sky-600 ring-1 ring-sky-100', dot: 'bg-sky-400' },
}

export const CATEGORY_LABEL: Record<PublicSpecies['category'], string> = {
  hardwood: 'Indian hardwood',
  imported: 'Imported',
  plantation: 'Plantation',
  softwood: 'Softwood',
}
