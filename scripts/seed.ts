/**
 * Demo data for Maruthi Timber Depot — a believable 80 days of a Karnataka timber depot.
 *
 *   npx vite-node scripts/seed.ts            (first run)
 *   npx vite-node scripts/seed.ts --reset    (wipe demo data, species & catalogue, then seed again)
 *
 * Staff logins are created through the admin API with generated passwords that are written only to
 * LOGINS.local.md (git-ignored). Every stock and money entry is posted by signing in as the owner and
 * calling the same database functions the app uses, so the demo obeys the real business rules.
 * Before go-live run supabase/purge_demo_data.sql.
 */
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { adminClient, apiKeys, PROJECT_REF, SUPABASE_URL } from './supabase-admin'

const STAFF_DOMAIN = 'staff.maruthitimber.in'
const LOGINS_FILE = 'LOGINS.local.md'
const RESET = process.argv.includes('--reset')

// ── deterministic randomness so a re-seed gives the same story ──
let rs = 20261025
const rnd = () => ((rs = (rs * 1103515245 + 12345) % 2147483648) / 2147483648)
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]
const between = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1))

const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10)
const day = (offset: number) => {
  const d = new Date(today + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

function password() {
  return 'Mtd-' + randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) + '-' + between(10, 99)
}

const STAFF = [
  { user: 'owner', name: 'Owner (Maruthi)', role: 'owner' },
  { user: 'manager', name: 'Suresh (Manager)', role: 'manager' },
  { user: 'accounts', name: 'Kavya (Accounts)', role: 'accounts' },
  { user: 'counter', name: 'Raghu (Billing)', role: 'sales' },
  { user: 'yard', name: 'Manju (Yard & Sawmill)', role: 'yard' },
] as const

async function ensureStaff(admin: SupabaseClient) {
  const saved: Record<string, string> = {}
  if (existsSync(LOGINS_FILE)) {
    for (const m of readFileSync(LOGINS_FILE, 'utf8').matchAll(/^\| (\w+) \| [^|]+\| [^|]+\| `([^`]+)` \|$/gm)) saved[m[1]] = m[2]
  }
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 })
  const out: { user: string; name: string; role: string; pass: string; id: string }[] = []
  for (const s of STAFF) {
    const email = `${s.user}@${STAFF_DOMAIN}`
    const pass = saved[s.user] ?? password()
    let id = list?.users.find((u) => u.email === email)?.id
    if (!id) {
      const { data, error } = await admin.auth.admin.createUser({ email, password: pass, email_confirm: true, user_metadata: { full_name: s.name } })
      if (error) throw new Error(`create ${email}: ${error.message}`)
      id = data.user.id
    } else if (!saved[s.user]) {
      await admin.auth.admin.updateUserById(id, { password: pass })
    }
    const { error } = await admin.from('profiles').upsert({ id, full_name: s.name, role: s.role, login_email: email, active: true })
    if (error) throw new Error(`profile ${email}: ${error.message}`)
    out.push({ ...s, pass, id })
  }
  writeFileSync(LOGINS_FILE, [
    '# Maruthi Timber Depot — demo staff logins (LOCAL ONLY, git-ignored)',
    '',
    'Sign in at /login with the user name (or e-mail) and password. Change these from Settings → Team before go-live.',
    '',
    '| user | name | role | password |',
    '| --- | --- | --- | --- |',
    ...out.map((o) => `| ${o.user} | ${o.name} | ${o.role} | \`${o.pass}\` |`),
    '',
  ].join('\n'))
  return out
}

// ── master data ──
const SPECIES = [
  { name: 'Ghana Teak', local_name: 'ಘಾನಾ ತೇಗ', botanical_name: 'Tectona grandis', origin: 'Ghana, West Africa', category: 'imported', density_kg_m3: 650, durability: 'Very durable · termite resistant', uses: 'Doors, windows, frames, furniture', description: 'Golden-brown plantation teak with an even grain — the everyday choice for door frames and windows.', color_hex: '#C08A4E', grain_hex: '#6E4421', log_rate_cft: 3400, sawn_rate_cft: 5200, sort_order: 1 },
  { name: 'Burma Teak', local_name: 'ಬರ್ಮಾ ತೇಗ', botanical_name: 'Tectona grandis', origin: 'Myanmar', category: 'imported', density_kg_m3: 660, durability: 'Outstanding · natural oils', uses: 'Main doors, pooja rooms, heirloom furniture', description: 'Old-growth teak with rich oil content and a deep golden lustre. The finest teak in the yard.', color_hex: '#B98043', grain_hex: '#5E3A1B', log_rate_cft: 6800, sawn_rate_cft: 9800, sort_order: 2 },
  { name: 'Nilambur Teak', local_name: 'ನಿಲಂಬೂರ್ ತೇಗ', botanical_name: 'Tectona grandis', origin: 'Nilambur, Kerala', category: 'hardwood', density_kg_m3: 640, durability: 'Very durable', uses: 'Doors, windows, cabinetry', description: 'Kerala teak with a fine, tight grain and warm honey colour.', color_hex: '#C99052', grain_hex: '#734821', log_rate_cft: 4400, sawn_rate_cft: 5900, sort_order: 3 },
  { name: 'Sal', local_name: 'ಸಾಲ', botanical_name: 'Shorea robusta', origin: 'Central India', category: 'hardwood', density_kg_m3: 870, durability: 'Very hard · heavy load bearing', uses: 'Beams, rafters, door frames, sleepers', description: 'Heavy, strong and dependable — the builder’s favourite for frames and structure.', color_hex: '#9C5F3A', grain_hex: '#5C301B', log_rate_cft: 1500, sawn_rate_cft: 2350, sort_order: 4 },
  { name: 'Honne', local_name: 'ಹೊನ್ನೆ', botanical_name: 'Pterocarpus marsupium', origin: 'Western Ghats', category: 'hardwood', density_kg_m3: 800, durability: 'Durable · stable', uses: 'Door & window frames, furniture', description: 'Reddish-gold Indian kino wood, prized in Karnataka homes for frames that never warp.', color_hex: '#B4552F', grain_hex: '#6E2814', log_rate_cft: 1750, sawn_rate_cft: 2750, sort_order: 5 },
  { name: 'Matti', local_name: 'ಮತ್ತಿ', botanical_name: 'Terminalia tomentosa', origin: 'Karnataka', category: 'hardwood', density_kg_m3: 860, durability: 'Hard · durable when seasoned', uses: 'Frames, rafters, reapers', description: 'Indian laurel — strong, dark and economical for structural work.', color_hex: '#8C6B4F', grain_hex: '#4F3A29', log_rate_cft: 1100, sawn_rate_cft: 1750, sort_order: 6 },
  { name: 'Halasu (Jackfruit)', local_name: 'ಹಲಸು', botanical_name: 'Artocarpus heterophyllus', origin: 'Malnad, Karnataka', category: 'hardwood', density_kg_m3: 600, durability: 'Durable · mellows to deep orange', uses: 'Doors, furniture, pooja mantapas', description: 'Bright yellow when cut, ageing to a rich amber — traditional and auspicious.', color_hex: '#D59A3D', grain_hex: '#9A5E1C', log_rate_cft: 1350, sawn_rate_cft: 2200, sort_order: 7 },
  { name: 'Rosewood', local_name: 'ಬೀಟೆ', botanical_name: 'Dalbergia latifolia', origin: 'Karnataka (permit timber)', category: 'hardwood', density_kg_m3: 850, durability: 'Exceptional', uses: 'Premium furniture, carving, inlay', description: 'Deep purple-brown with dark streaks. Supplied only with forest permits, on order.', color_hex: '#6A3426', grain_hex: '#2E1410', log_rate_cft: 7500, sawn_rate_cft: 9500, sort_order: 8 },
  { name: 'Red Meranti', local_name: 'ರೆಡ್ ಮೆರಾಂಟಿ', botanical_name: 'Shorea spp.', origin: 'Malaysia', category: 'imported', density_kg_m3: 600, durability: 'Moderately durable', uses: 'Windows, mouldings, interiors', description: 'Straight-grained red hardwood that machines beautifully.', color_hex: '#B4614A', grain_hex: '#7A3524', log_rate_cft: 1900, sawn_rate_cft: 3000, sort_order: 9 },
  { name: 'Silver Oak', local_name: 'ಸಿಲ್ವರ್ ಓಕ್', botanical_name: 'Grevillea robusta', origin: 'Coorg & Chikmagalur estates', category: 'plantation', density_kg_m3: 570, durability: 'Light duty', uses: 'Packing, shuttering, light furniture', description: 'Estate-grown with a lovely silvery ray figure. Budget-friendly.', color_hex: '#C9A27E', grain_hex: '#8C6448', log_rate_cft: 650, sawn_rate_cft: 820, sort_order: 10 },
  { name: 'Pine (Imported)', local_name: 'ಪೈನ್', botanical_name: 'Pinus radiata', origin: 'New Zealand', category: 'softwood', density_kg_m3: 500, durability: 'Treated for indoor use', uses: 'Panelling, furniture frames, crates', description: 'Pale, light and easy to work, with charming knots.', color_hex: '#E6C48E', grain_hex: '#B47A3C', log_rate_cft: 800, sawn_rate_cft: 1150, sort_order: 11 },
  { name: 'Neem', local_name: 'ಬೇವು', botanical_name: 'Azadirachta indica', origin: 'Kolar & Chikkaballapur', category: 'plantation', density_kg_m3: 720, durability: 'Naturally insect repellent', uses: 'Furniture, cupboards, agricultural tools', description: 'Local neem — insects stay away, naturally.', color_hex: '#B5774C', grain_hex: '#734325', log_rate_cft: 950, sawn_rate_cft: 1350, sort_order: 12 },
]

const PANELS = [
  { name: '18mm BWP Marine Plywood 8×4', thickness_mm: 18, buy: 82, sale_rate: 112, min_stock: 15 },
  { name: '12mm MR Plywood 8×4', thickness_mm: 12, buy: 44, sale_rate: 62, min_stock: 20 },
  { name: '6mm MR Plywood 8×4', thickness_mm: 6, buy: 27, sale_rate: 38, min_stock: 20 },
  { name: '19mm Block Board 8×4', thickness_mm: 19, buy: 63, sale_rate: 88, min_stock: 10 },
  { name: '4mm Teak Veneer Ply 8×4', thickness_mm: 4, buy: 39, sale_rate: 55, min_stock: 10 },
]
const UNITS = [
  { name: 'Flush Door 30mm (7×3 ft)', buy: 2200, sale_rate: 3200, min_stock: 6, hsn: '4418' },
  { name: 'Ghana Teak Panel Door (7×3 ft)', buy: 19500, sale_rate: 27500, min_stock: 2, hsn: '4418' },
  { name: 'Teak Door Frame Set 5″×3″ (Chowkat)', buy: 6800, sale_rate: 9500, min_stock: 3, hsn: '4418' },
]
const SERVICES = [
  { name: 'Sawing charges (customer logs)', uom: 'cft', sale_rate: 180 },
  { name: 'Cutting / sizing to drawing', uom: 'job', sale_rate: 250 },
  { name: 'Planing & thicknessing', uom: 'rft', sale_rate: 6 },
  { name: 'Anti-termite treatment', uom: 'cft', sale_rate: 120 },
  { name: 'Transport — local delivery', uom: 'job', sale_rate: 1200 },
  { name: 'Loading / unloading (hamali)', uom: 'job', sale_rate: 300 },
]

const SUPPLIERS = [
  { name: 'Coastal Timber Imports', city: 'Mangaluru', state_code: '29', gstin: '29AAKFC4512M1Z8', phone: '9000010101', category: 'Importer', credit_days: 30 },
  { name: 'Sahyadri Forest Depot (KFDC auction)', city: 'Shivamogga', state_code: '29', gstin: null, phone: '9000010102', category: 'Forest auction', credit_days: 0 },
  { name: 'Nilambur Teak Traders', city: 'Nilambur, Kerala', state_code: '32', gstin: '32AAGFN7781K1Z3', phone: '9000010103', category: 'Mill', credit_days: 21 },
  { name: 'Kolar Plywood Distributors', city: 'Kolar', state_code: '29', gstin: '29AADFK3390P1ZQ', phone: '9000010104', category: 'Distributor', credit_days: 45 },
  { name: 'Malnad Saw Mill', city: 'Sakleshpur', state_code: '29', gstin: '29AAMFM6620B1Z1', phone: '9000010105', category: 'Mill', credit_days: 15 },
  { name: 'Shilpa Door Works', city: 'Bengaluru', state_code: '29', gstin: '29ABBFS2290L1Z6', phone: '9000010106', category: 'Door maker', credit_days: 30 },
]
const CUSTOMERS = [
  { name: 'Shree Sai Builders', city: 'Kolar', gstin: '29ABKFS4512M1Z8', credit_limit: 600000, credit_days: 30, category: 'Builder', phone: '9000020201' },
  { name: 'Green Valley Constructions', city: 'Bengaluru', gstin: '29AAHFG8823C1Z2', credit_limit: 400000, credit_days: 45, category: 'Contractor', phone: '9000020202' },
  { name: 'Lakshmi Interiors', city: 'Kolar', gstin: '29AAJFL5531D1ZK', credit_limit: 150000, credit_days: 15, category: 'Interior designer', phone: '9000020203' },
  { name: 'Royal Furniture Works', city: 'Malur', gstin: '29AAQFR9912E1Z4', credit_limit: 250000, credit_days: 30, category: 'Furniture maker', phone: '9000020204' },
  { name: 'Venkateshwara Contractors', city: 'Bangarapet', gstin: null, credit_limit: 300000, credit_days: 30, category: 'Contractor', phone: '9000020205' },
  { name: 'Hosur Homes Pvt Ltd', city: 'Hosur, Tamil Nadu', gstin: '33AACCH4471F1Z9', state_code: '33', credit_limit: 500000, credit_days: 30, category: 'Builder', phone: '9000020206' },
  { name: 'Mr. Prakash Rao', city: 'Kolar', gstin: null, credit_limit: 0, credit_days: 0, category: 'Home owner', phone: '9000020207' },
  { name: 'Mrs. Anitha Gowda', city: 'Mulbagal', gstin: null, credit_limit: 50000, credit_days: 7, category: 'Home owner', phone: '9000020208' },
]
const CARPENTERS = [
  { name: 'Manjunath Mestri', city: 'Kolar', commission_pct: 2, phone: '9000030301' },
  { name: 'Ravi Carpentry Works', city: 'Malur', commission_pct: 1.5, phone: '9000030302' },
  { name: 'Basavaraj Woodworks', city: 'KGF', commission_pct: 2.5, phone: '9000030303' },
]
const WALKINS = ['Ramesh K', 'Srinivas M', 'Nagaraj B', 'Farooq Ahmed', 'Deepa S', 'Chandrashekar', 'Mohan Kumar', 'Shobha R', 'Imran Pasha', 'Gopal Reddy']

// sections a mill cuts from each species, with typical lengths
const CUT_PLAN: Record<string, { t: number; w: number; lens: number[] }[]> = {
  'Ghana Teak': [{ t: 5, w: 3, lens: [7, 8] }, { t: 4, w: 3, lens: [7, 8] }, { t: 4, w: 2, lens: [8, 10] }, { t: 6, w: 1, lens: [7, 8] }, { t: 3, w: 2, lens: [6, 7] }],
  'Burma Teak': [{ t: 6, w: 4, lens: [7, 8] }, { t: 5, w: 3, lens: [7] }, { t: 8, w: 1, lens: [7] }],
  'Red Meranti': [{ t: 4, w: 3, lens: [8, 10] }, { t: 6, w: 1, lens: [8, 10] }, { t: 3, w: 2, lens: [8] }],
  Sal: [{ t: 5, w: 3, lens: [7, 8] }, { t: 4, w: 3, lens: [8, 10] }, { t: 4, w: 2, lens: [10, 12] }, { t: 6, w: 4, lens: [10, 12] }],
  Honne: [{ t: 5, w: 3, lens: [7] }, { t: 4, w: 3, lens: [7, 8] }, { t: 4, w: 2, lens: [8] }],
  Matti: [{ t: 4, w: 3, lens: [8, 10] }, { t: 4, w: 2, lens: [10, 12] }, { t: 3, w: 2, lens: [10] }],
  'Halasu (Jackfruit)': [{ t: 5, w: 3, lens: [7] }, { t: 6, w: 1, lens: [6, 7] }, { t: 4, w: 2, lens: [7] }],
}

const defaults = <T,>(x: T) => x
type Sb = SupabaseClient
async function call<T = any>(sb: Sb, fn: string, p: unknown): Promise<T> {
  const { data, error } = await sb.rpc(fn, { p })
  if (error) throw new Error(`${fn}: ${error.message}`)
  return data as T
}

async function main() {
  const admin = adminClient()
  if (RESET) {
    console.log('Purging demo data…')
    execSync(`npx supabase db query --linked --project-ref ${PROJECT_REF} -f supabase/purge_demo_data.sql`, { stdio: ['ignore', 'ignore', 'inherit'] })
    for (const t of ['products', 'species']) {
      const { error } = await admin.from(t).delete().not('id', 'is', null)
      if (error) throw new Error(`clear ${t}: ${error.message}`)
    }
  }
  const staff = await ensureStaff(admin)
  console.log(`Staff logins ready (${staff.length}) → ${LOGINS_FILE}`)

  const { count } = await admin.from('sales_docs').select('id', { count: 'exact', head: true })
  if ((count ?? 0) > 0) {
    console.log('Transactions already exist — run with --reset to rebuild the demo.')
    return
  }

  // sign in as the owner exactly like the app does
  const owner = staff.find((s) => s.role === 'owner')!
  const sb = createClient(SUPABASE_URL, apiKeys().publishable, { auth: { persistSession: false } })
  const { error: se } = await sb.auth.signInWithPassword({ email: `owner@${STAFF_DOMAIN}`, password: owner.pass })
  if (se) throw new Error(`owner sign-in: ${se.message}`)

  await sb.from('company_settings').update({
    name: 'Maruthi Timber Depot',
    tagline: 'Seasoned timber · Sawmill · Doors & frames',
    state_name: 'Karnataka', state_code: '29', invoice_prefix: 'MTD',
  }).eq('id', 1)

  // masters
  const { data: sp, error: spe } = await sb.from('species').insert(SPECIES, { defaultToNull: false }).select('id,name')
  if (spe) throw new Error(spe.message)
  const S = Object.fromEntries(sp!.map((r) => [r.name, r.id as string]))
  const { data: pn, error: pne } = await sb.from('products').insert([
    ...PANELS.map((p) => ({ kind: 'panel', name: p.name, panel_length_ft: 8, panel_width_ft: 4, thickness_mm: p.thickness_mm, uom: 'sqft', hsn: '4412', sale_rate: p.sale_rate, min_stock: p.min_stock, bay: 'Shed P' })),
    ...UNITS.map((u) => ({ kind: 'unit', name: u.name, uom: 'nos', hsn: u.hsn, sale_rate: u.sale_rate, min_stock: u.min_stock, bay: 'Showroom' })),
    ...SERVICES.map((s) => ({ kind: 'service', name: s.name, uom: s.uom, hsn: '998898', sale_rate: s.sale_rate })),
    { kind: 'byproduct', name: 'Firewood & off-cuts', uom: 'kg', hsn: '4401', gst_rate: 5, sale_rate: 6, bay: 'Firewood heap' },
    { kind: 'byproduct', name: 'Sawdust (bag)', uom: 'nos', hsn: '4401', gst_rate: 5, sale_rate: 40, bay: 'Mill shed' },
  ], { defaultToNull: false }).select('id,name,kind')
  if (pne) throw new Error(pne.message)
  const P = Object.fromEntries(pn!.map((r) => [r.name, r.id as string]))

  const { data: parties, error: pe } = await sb.from('parties').insert([
    ...SUPPLIERS.map((s) => ({ ...s, is_customer: false, is_supplier: true })),
    ...CUSTOMERS.map((c) => ({ state_code: '29', ...c, is_customer: true })),
    ...CARPENTERS.map((c) => ({ ...c, is_customer: false, is_carpenter: true, category: 'Carpenter / mestri' })),
  ], { defaultToNull: false }).select('id,name')
  if (pe) throw new Error(pe.message)
  const PT = Object.fromEntries(parties!.map((r) => [r.name, r.id as string]))
  console.log('Masters: species', sp!.length, '· products', pn!.length, '· parties', parties!.length)

  // ── timeline ──
  type Ev = { d: number; run: () => Promise<void> }
  const events: Ev[] = []
  let logSeq = 1000
  const logs = (species: string, prefix: string, n: number, rate: number, girth: [number, number], len: [number, number], bark = 1) =>
    Array.from({ length: n }, () => ({
      line_kind: 'log', species_id: S[species], log_no: `${prefix}-${++logSeq}`, length_ft: between(len[0], len[1]),
      girth_in: between(girth[0], girth[1]), bark_allowance_in: bark, rate, bay: pick(['Yard A', 'Yard B', 'Yard C']),
    }))
  const sawn = (species: string, grade: string | null, t: number, w: number, len: number, pieces: number, rate: number) =>
    ({ line_kind: 'sawn', species_id: S[species], grade, thickness_in: t, width_in: w, length_ft: len, pieces, rate })
  const purchase = (d: number, supplier: string, lines: unknown[], extra: Record<string, unknown> = {}) =>
    events.push({ d, run: async () => {
      const r = await call(sb, 'post_purchase', { supplier_id: PT[supplier], bill_date: day(d), lines, ...extra })
      console.log('  purchase', r.ref_no, day(d), supplier, '₹' + r.total)
    } })

  purchase(-80, 'Coastal Timber Imports', [...logs('Ghana Teak', 'GT', 16, 2650, [56, 76], [11, 16], 2), ...logs('Red Meranti', 'RM', 5, 1500, [60, 80], [12, 16], 2)],
    { bill_no: 'CTI/2026/1187', permit_no: 'KFD/MNG/TP/2026/0412', vehicle_no: 'KA19AB4410', lot_code: 'GH-26-14', freight: 18000, unloading: 3500, payment: { amount: 150000, mode: 'bank', reference: 'NEFT 0412' } })
  purchase(-77, 'Kolar Plywood Distributors', [
    ...PANELS.map((p) => ({ line_kind: 'panel', product_id: P[p.name], pieces: between(40, 80), rate: p.buy })),
    ...UNITS.map((u) => ({ line_kind: 'unit', product_id: P[u.name], qty: u.name.startsWith('Flush') ? 24 : u.name.includes('Panel') ? 4 : 8, rate: u.buy })),
  ], { bill_no: 'KPD/887', vehicle_no: 'KA08C2231', unloading: 1200 })
  purchase(-74, 'Sahyadri Forest Depot (KFDC auction)', [
    ...logs('Sal', 'SL', 12, 1150, [50, 68], [10, 14]), ...logs('Honne', 'HN', 8, 1350, [46, 62], [8, 12]),
    ...logs('Matti', 'MT', 10, 850, [44, 60], [10, 14]), ...logs('Halasu (Jackfruit)', 'HL', 5, 1050, [50, 64], [8, 10]),
  ], { bill_no: 'KFDC/SMG/A-2291', permit_no: 'KFD/SMG/TP/2026/1188', vehicle_no: 'KA14B7702', lot_code: 'Auction lot 37', freight: 14500, unloading: 2800, payment: { amount: 120000, mode: 'cheque', reference: 'CHQ 311045' } })
  purchase(-70, 'Nilambur Teak Traders', [
    sawn('Nilambur Teak', 'A', 5, 3, 7, 90, 4300), sawn('Nilambur Teak', 'A', 5, 3, 8, 70, 4300), sawn('Nilambur Teak', 'A', 4, 3, 7, 80, 4200), sawn('Nilambur Teak', 'B', 6, 1, 7, 140, 3900), sawn('Nilambur Teak', 'A', 4, 2, 8, 90, 4100),
  ], { bill_no: 'NTT/5530', permit_no: 'KL/FD/TP/88412', vehicle_no: 'KL10AK8812', freight: 9500, unloading: 1000 })
  purchase(-66, 'Malnad Saw Mill', [
    sawn('Silver Oak', null, 4, 2, 10, 220, 600), sawn('Silver Oak', null, 3, 2, 12, 260, 600), sawn('Pine (Imported)', null, 6, 1, 8, 240, 820), sawn('Pine (Imported)', null, 4, 1, 8, 260, 820),
    sawn('Neem', null, 4, 2, 7, 90, 950), sawn('Sal', null, 6, 4, 12, 40, 1650), sawn('Matti', null, 3, 2, 10, 160, 1150), sawn('Sal', null, 5, 3, 7, 120, 1650),
  ], { bill_no: 'MSM/1043', vehicle_no: 'KA46A3311', freight: 6500 })
  purchase(-60, 'Shilpa Door Works', [{ line_kind: 'unit', product_id: P['Ghana Teak Panel Door (7×3 ft)'], qty: 3, rate: 19500 }, { line_kind: 'unit', product_id: P['Teak Door Frame Set 5″×3″ (Chowkat)'], qty: 6, rate: 6800 }], { bill_no: 'SDW/223' })
  purchase(-45, 'Coastal Timber Imports', [...logs('Ghana Teak', 'GT', 14, 2700, [56, 78], [11, 16], 2), ...logs('Burma Teak', 'BT', 4, 5200, [60, 74], [10, 12], 2)],
    { bill_no: 'CTI/2026/1342', permit_no: 'KFD/MNG/TP/2026/0577', vehicle_no: 'KA19AB4410', lot_code: 'GH-26-19', freight: 16000, unloading: 3000, payment: { amount: 100000, mode: 'bank', reference: 'NEFT 0577' } })
  purchase(-30, 'Kolar Plywood Distributors', PANELS.slice(0, 3).map((p) => ({ line_kind: 'panel', product_id: P[p.name], pieces: between(25, 45), rate: p.buy + 1 })), { bill_no: 'KPD/1012', unloading: 800 })
  purchase(-14, 'Malnad Saw Mill', [sawn('Silver Oak', null, 4, 2, 10, 160, 610), sawn('Pine (Imported)', null, 6, 1, 8, 180, 830), sawn('Sal', null, 4, 2, 10, 140, 1650), sawn('Neem', null, 4, 2, 7, 60, 960)], { bill_no: 'MSM/1188', freight: 5500 })

  // sawmill runs: saw 1–3 logs, cut the species' plan to a realistic Hoppus yield (64–76%)
  const sawmill = (d: number, speciesList: string[], nLogs: number) =>
    events.push({ d, run: async () => {
      const { data: yard } = await sb.from('logs').select('id,cft,length_ft,species_id,species(name)').eq('status', 'in_yard').in('species_id', speciesList.map((s) => S[s])).order('log_no').limit(nLogs)
      if (!yard?.length) return
      const inCft = yard.reduce((a, l) => a + Number(l.cft), 0)
      const target = inCft * (0.64 + rnd() * 0.12)
      const outputs: any[] = []
      let got = 0
      const spName = (yard[0] as any).species.name as string
      const plan = CUT_PLAN[spName] ?? CUT_PLAN.Sal
      const maxLen = Math.min(...yard.map((l) => Number(l.length_ft)))
      let guard = 0
      while (got < target * 0.97 && guard++ < 60) {
        const c = pick(plan)
        const len = Math.min(pick(c.lens), maxLen)
        const per = (c.t * c.w * len) / 144
        const room = Math.floor((target - got) / per)
        if (room < 1) { if (plan.every((x) => (x.t * x.w * Math.min(...x.lens)) / 144 > target - got)) break; continue }
        const pcs = Math.max(1, Math.min(room, between(6, 20)))
        const ex = outputs.find((o) => o.thickness_in === c.t && o.width_in === c.w && o.length_ft === len)
        if (ex) ex.pieces += pcs
        else outputs.push({ species_id: (yard[0] as any).species_id, grade: 'A', thickness_in: c.t, width_in: c.w, length_ft: len, pieces: pcs })
        got += per * pcs
      }
      const r = await call(sb, 'post_conversion', {
        conv_date: day(d), logs: yard.map((l) => l.id), outputs, operator: pick(['Manju', 'Shivanna', 'Ramappa']),
        processing_cost: Math.round(inCft * 110), firewood_kg: Math.round((inCft - got) * 9), sawdust_bags: Math.round(inCft / 3),
      })
      console.log('  sawmill', r.ref_no, day(d), spName, `${r.input_cft} → ${r.output_cft} CFT (${r.yield_pct}%)`)
    } })
  sawmill(-76, ['Ghana Teak'], 4); sawmill(-72, ['Sal'], 4); sawmill(-68, ['Honne'], 3); sawmill(-63, ['Ghana Teak'], 3)
  sawmill(-58, ['Matti'], 4); sawmill(-52, ['Red Meranti'], 2); sawmill(-48, ['Halasu (Jackfruit)'], 2); sawmill(-42, ['Ghana Teak'], 4)
  sawmill(-36, ['Sal'], 3); sawmill(-29, ['Burma Teak'], 2); sawmill(-22, ['Ghana Teak'], 4); sawmill(-16, ['Matti'], 3)
  sawmill(-12, ['Sal'], 2); sawmill(-9, ['Honne'], 2); sawmill(-4, ['Ghana Teak'], 3)

  // sales: build each bill from what is actually in the yard that day
  async function stockPick(maxLines: number) {
    const { data } = await sb.from('v_sawn_stock').select('product_id,length_ft,pieces,sale_rate,species_name').gt('pieces', 3)
    const rows = data ?? []
    const lines: any[] = []
    for (let i = 0; i < maxLines && rows.length; i++) {
      const r = rows.splice(Math.floor(rnd() * rows.length), 1)[0]
      lines.push({ line_kind: 'sawn', product_id: r.product_id, length_ft: Number(r.length_ft), pieces: Math.max(1, Math.min(r.pieces - 1, between(2, 8))), rate: Number(r.sale_rate) * (rnd() < 0.3 ? 0.96 : 1) })
    }
    return lines
  }
  const panelLine = () => { const p = pick(PANELS); return { line_kind: 'panel', product_id: P[p.name], pieces: between(1, 6), rate: p.sale_rate } }
  const serviceLine = () => { const s = pick(SERVICES.filter((x) => x.uom === 'job')); return { line_kind: 'service', product_id: P[s.name], qty: 1, rate: s.sale_rate } }

  const sale = (d: number, kind: 'walkin' | 'account', opts: { customer?: string; carpenter?: boolean; pay?: number; delivery?: boolean; quotation?: boolean; units?: boolean } = {}) =>
    events.push({ d, run: async () => {
      const lines = await stockPick(between(1, 3))
      if (rnd() < 0.45) lines.push(panelLine())
      if (opts.units) lines.push({ line_kind: 'unit', product_id: P[pick(UNITS).name], qty: 1 })
      if (rnd() < 0.35 || opts.delivery) lines.push(serviceLine())
      if (!lines.length) return
      const cust = kind === 'account' ? opts.customer ?? pick(CUSTOMERS.slice(0, 5)).name : undefined
      const p: Record<string, unknown> = {
        doc_type: opts.quotation ? 'quotation' : 'invoice', doc_date: day(d), lines,
        ...(cust ? { customer_id: PT[cust] } : { customer_name: pick(WALKINS), customer_phone: `90000${between(40000, 49999)}` }),
        ...(opts.carpenter || rnd() < 0.3 ? { referred_by: PT[pick(CARPENTERS).name] } : {}),
        ...(opts.delivery || rnd() < 0.4 ? { delivery_mode: 'delivery', delivery_address: `${cust ?? 'Customer'} site, ${pick(['Kolar', 'Malur', 'KGF', 'Bangarapet', 'Mulbagal'])}`, vehicle_no: pick(['KA07A1102', 'KA07B5520']), driver_name: pick(['Venkatesh', 'Salim']) } : {}),
      }
      if (!opts.quotation) {
        if (kind === 'walkin') p.payment = { amount: 9_999_999, mode: pick(['cash', 'upi', 'upi', 'card']) }
        else if (opts.pay) p.payment = { amount: opts.pay, mode: pick(['upi', 'bank', 'cash']) }
      }
      try {
        const r = await call(sb, 'post_sale', p)
        if (!opts.quotation && p.delivery_mode === 'delivery') {
          const status = d < -3 ? 'delivered' : d < -1 ? 'dispatched' : 'pending'
          if (status !== 'pending') await sb.rpc('update_delivery', { p_id: r.id, p_status: status })
        }
      } catch (e) {
        if (String(e).includes('CREDIT_LIMIT')) { p.override_credit = true; await call(sb, 'post_sale', p) } else throw e
      }
    } })

  for (let d = -75; d <= 0; d++) {
    const weekday = new Date(day(d) + 'T00:00:00Z').getUTCDay()
    if (weekday === 0 && rnd() < 0.6) continue // Sunday half day
    const n = weekday === 6 ? between(2, 4) : between(1, 3)
    for (let i = 0; i < n; i++) {
      const r = rnd()
      if (r < 0.5) sale(d, 'walkin')
      else sale(d, 'account', { pay: rnd() < 0.4 ? between(5, 20) * 1000 : undefined, units: rnd() < 0.15 })
    }
  }
  sale(-33, 'account', { customer: 'Hosur Homes Pvt Ltd', delivery: true }) // inter-state → IGST
  sale(-12, 'account', { customer: 'Hosur Homes Pvt Ltd', delivery: true, pay: 25000 })
  sale(-3, 'account', { quotation: true, customer: 'Green Valley Constructions' })
  sale(-2, 'account', { quotation: true, customer: 'Lakshmi Interiors' })
  sale(-1, 'walkin', { quotation: true })
  sale(-1, 'account', { customer: 'Royal Furniture Works', delivery: true, carpenter: true })
  sale(0, 'account', { customer: 'Shree Sai Builders', delivery: true })

  // a whole log sold to a furniture maker
  events.push({ d: -40, run: async () => {
    const { data } = await sb.from('logs').select('id').eq('status', 'in_yard').eq('species_id', S['Halasu (Jackfruit)']).limit(1)
    if (data?.[0]) await call(sb, 'post_sale', { doc_date: day(-40), customer_id: PT['Royal Furniture Works'], lines: [{ line_kind: 'log', log_id: data[0].id }], payment: { amount: 20000, mode: 'bank' } })
  } })

  // collections from account customers (oldest bills first) and supplier payments
  for (const d of [-60, -52, -45, -38, -31, -24, -17, -10, -5, -2]) {
    events.push({ d, run: async () => {
      for (const c of CUSTOMERS.filter((x) => x.credit_limit > 0)) {
        const { data } = await sb.from('v_party_balances').select('balance').eq('party_id', PT[c.name]).single()
        const bal = Number(data?.balance ?? 0)
        if (bal > 5000 && rnd() < 0.55) {
          const amt = Math.round((bal * (0.35 + rnd() * 0.5)) / 500) * 500
          const mode = pick(['bank', 'upi', 'cheque', 'cash'])
          await call(sb, 'record_payment', { direction: 'in', party_id: PT[c.name], amount: amt, mode, pay_date: day(d), auto_allocate: true, reference: mode === 'cheque' ? `CHQ ${between(100000, 999999)}` : mode === 'bank' ? `NEFT ${between(1000, 9999)}` : undefined })
        }
      }
    } })
  }
  for (const [d, sup] of [[-50, 'Kolar Plywood Distributors'], [-40, 'Nilambur Teak Traders'], [-35, 'Malnad Saw Mill'], [-20, 'Coastal Timber Imports'], [-18, 'Sahyadri Forest Depot (KFDC auction)'], [-8, 'Shilpa Door Works']] as const) {
    events.push({ d, run: async () => {
      const { data } = await sb.from('v_party_balances').select('balance').eq('party_id', PT[sup]).single()
      const owe = -Number(data?.balance ?? 0)
      if (owe > 1000) await call(sb, 'record_payment', { direction: 'out', party_id: PT[sup], amount: Math.round((owe * (0.5 + rnd() * 0.5)) / 1000) * 1000, mode: 'bank', pay_date: day(d), purpose: 'purchase', auto_allocate: true, reference: `NEFT ${between(1000, 9999)}` })
    } })
  }

  // returns, a cancelled bill, a bounced cheque, commission payout
  events.push({ d: -26, run: async () => {
    const { data } = await sb.from('sales_docs').select('id, sales_lines(id,line_kind,pieces)').eq('doc_type', 'invoice').eq('status', 'posted').not('customer_id', 'is', null).lte('doc_date', day(-27)).order('doc_date', { ascending: false }).limit(10)
    const inv = data?.find((x: any) => x.sales_lines.some((l: any) => l.line_kind === 'sawn' && Number(l.pieces) >= 3)) as any
    if (inv) {
      const line = inv.sales_lines.find((l: any) => l.line_kind === 'sawn' && Number(l.pieces) >= 3)
      await call(sb, 'post_credit_note', { invoice_id: inv.id, doc_date: day(-26), reason: 'Extra pieces returned unused from site', lines: [{ line_id: line.id, pieces: 2 }] })
    }
  } })
  events.push({ d: -11, run: async () => {
    const { data } = await sb.from('sales_docs').select('id').eq('doc_type', 'invoice').eq('status', 'posted').eq('doc_date', day(-11)).is('customer_id', null).limit(1)
    if (data?.[0]) await sb.rpc('cancel_sale', { p_id: data[0].id, p_reason: 'Customer changed the size — billed again' })
  } })
  events.push({ d: -6, run: async () => {
    const { data } = await sb.from('payments').select('id').eq('mode', 'cheque').eq('direction', 'in').eq('status', 'pending').order('pay_date').limit(3)
    if (data?.[0]) await sb.rpc('set_payment_status', { p_id: data[0].id, p_status: 'bounced', p_note: 'Returned — insufficient funds' })
    if (data?.[1]) await sb.rpc('set_payment_status', { p_id: data[1].id, p_status: 'cleared' })
  } })
  events.push({ d: -7, run: async () => {
    await call(sb, 'record_payment', { direction: 'out', party_id: PT['Manjunath Mestri'], amount: 1500, mode: 'cash', pay_date: day(-7), purpose: 'commission', notes: 'Commission for September referrals' })
  } })

  // expenses
  const expense = (d: number, category: string, amount: number, paid_to: string, mode = 'cash', notes?: string) =>
    events.push({ d, run: async () => { const { error } = await sb.from('expenses').insert({ exp_date: day(d), category, amount, paid_to, mode, notes }); if (error) throw new Error(error.message) } })
  for (let d = -77; d <= 0; d += 7) {
    expense(d, 'Labour wages', between(17, 21) * 1000, 'Yard & mill labour (weekly)')
    expense(d + 2, 'Diesel & fuel', between(25, 38) * 100, 'Indian Oil, Kolar', 'upi')
  }
  for (const d of [-55, -25]) {
    expense(d, 'Sawmill power', between(13, 16) * 1000, 'BESCOM', 'bank')
    expense(d + 1, 'Rent', 25000, 'Yard owner', 'bank')
    expense(d + 1, 'Salaries', 68000, 'Office & counter staff', 'bank')
  }
  for (const d of [-64, -43, -19, -3]) expense(d, 'Blade sharpening & maintenance', between(9, 18) * 100, 'Sri Ganesh Saw Works')
  expense(-47, 'Forest permit & fees', 3200, 'Range Forest Office', 'bank', 'Transit permit renewal')
  expense(-15, 'Transport', 4500, 'Hired lorry', 'upi', 'Extra delivery trip — Hosur')
  expense(-2, 'Office & tea', 640, 'Tea stall')

  // run the story in date order
  events.sort((a, b) => a.d - b.d)
  for (const e of events) await e.run()

  // website enquiries
  const { data: q } = await sb.from('sales_docs').select('id').eq('doc_type', 'quotation').eq('status', 'open').limit(1)
  await admin.from('enquiries').insert(defaults([
    { name: 'Harish', phone: '9000040401', city: 'Kolar', requirement: 'Need teak main door frame 5x3 and 2 window frames for new house', species_interest: 'Ghana Teak', est_cft: 14, status: 'new' },
    { name: 'Sunitha', phone: '9000040402', city: 'Malur', requirement: 'Honne wood for 6 windows, please share rate', species_interest: 'Honne', est_cft: 9, status: 'new' },
    { name: 'Arun Constructions', phone: '9000040403', city: 'Bangarapet', requirement: 'Sal rafters 4x3 x 12ft — 60 nos for roof', species_interest: 'Sal', est_cft: 60, status: 'contacted', notes: 'Visiting yard on Saturday' },
    { name: 'Vinay', phone: '9000040404', city: 'KGF', requirement: 'Plywood 18mm 20 sheets and block board 10 sheets', species_interest: null, est_cft: null, status: 'quoted', quotation_id: q?.[0]?.id ?? null },
    { name: 'Meera', phone: '9000040405', city: 'Kolar', requirement: 'Jackfruit wood pooja mantapa — custom', species_interest: 'Halasu (Jackfruit)', est_cft: 6, status: 'won' },
  ]), { defaultToNull: false })

  const { data: dash } = await sb.rpc('dashboard_snapshot')
  console.log('Done. Month sales ₹', dash?.month?.sales, '· stock CFT', dash?.stock?.sawn_cft, '+ logs', dash?.stock?.log_cft, '· receivable ₹', dash?.receivable)
  await sb.auth.signOut()
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
