// Indian number formatting: lakhs & crores, rupees, amount in words for invoices.

const inr0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
const inr2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const num = (v: unknown) => Number(v ?? 0) || 0

/** ₹1,23,456 (no paise) */
export function rupees(v: unknown): string {
  const n = num(v)
  return (n < 0 ? '−₹' : '₹') + inr0.format(Math.abs(Math.round(n)))
}

/** ₹1,23,456.50 */
export function rupees2(v: unknown): string {
  const n = num(v)
  return (n < 0 ? '−₹' : '₹') + inr2.format(Math.abs(n))
}

/** ₹4.2 L, ₹1.1 Cr, ₹86.5 K — for tight dashboard tiles */
export function rupeesShort(v: unknown): string {
  const n = num(v)
  const a = Math.abs(n)
  const s = n < 0 ? '−₹' : '₹'
  if (a >= 1e7) return `${s}${trim(a / 1e7, 2)} Cr`
  if (a >= 1e5) return `${s}${trim(a / 1e5, 2)} L`
  if (a >= 1e3) return `${s}${trim(a / 1e3, 1)} K`
  return s + inr0.format(Math.round(a))
}

/** plain number with up to `d` decimals, Indian grouping */
export function fmt(v: unknown, d = 2): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: d }).format(num(v))
}

/** CFT with 3 decimals but trailing zeros trimmed */
export const cft = (v: unknown) => `${fmt(v, 3)} CFT`

function trim(n: number, d: number) {
  return Number(n.toFixed(d)).toString()
}

/** 5 -> 5, 1.5 -> 1½, 2.25 -> 2¼, 0.75 -> ¾ (timber trade writes sizes this way) */
export function size(v: unknown): string {
  const n = num(v)
  const w = Math.floor(n)
  const f = Math.round((n - w) * 100) / 100
  const frac: Record<number, string> = { 0.25: '¼', 0.5: '½', 0.75: '¾' }
  if (f === 0) return String(w)
  if (frac[f]) return (w ? String(w) : '') + frac[f]
  return trim(n, 3)
}

export function sectionLabel(t: unknown, w: unknown) {
  return `${size(t)}″ × ${size(w)}″`
}

// ───────────── dates (always Indian Standard Time) ─────────────
export function todayIST(): string {
  return new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10)
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function monthStart(iso = todayIST()): string {
  return iso.slice(0, 8) + '01'
}

/** Indian financial year start (1 April) for a date */
export function fyStart(iso = todayIST()): string {
  const y = Number(iso.slice(0, 4))
  const m = Number(iso.slice(5, 7))
  return `${m >= 4 ? y : y - 1}-04-01`
}

const dFmt = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
const dShort = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' })

export function date(iso?: string | null): string {
  if (!iso) return '—'
  return dFmt.format(new Date(iso.slice(0, 10) + 'T00:00:00Z'))
}
export function dateShort(iso?: string | null): string {
  if (!iso) return '—'
  return dShort.format(new Date(iso.slice(0, 10) + 'T00:00:00Z'))
}
export function dateTime(iso?: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(iso))
}
export function daysBetween(fromIso: string, toIso: string) {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86400e3)
}
export function relDays(iso?: string | null): string {
  if (!iso) return ''
  const d = daysBetween(iso.slice(0, 10), todayIST())
  if (d === 0) return 'today'
  if (d === 1) return 'yesterday'
  if (d === -1) return 'tomorrow'
  return d > 0 ? `${d} days ago` : `in ${-d} days`
}

// ───────────── amount in words (Indian system) ─────────────
const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen',
  'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function twoDigits(n: number): string {
  if (n < 20) return ones[n]
  return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '')
}
function threeDigits(n: number): string {
  const h = Math.floor(n / 100)
  const r = n % 100
  return [h ? ones[h] + ' Hundred' : '', r ? twoDigits(r) : ''].filter(Boolean).join(' ')
}

export function inWords(n: number): string {
  n = Math.floor(Math.abs(n))
  if (n === 0) return 'Zero'
  const crore = Math.floor(n / 1e7)
  const lakh = Math.floor((n % 1e7) / 1e5)
  const thousand = Math.floor((n % 1e5) / 1e3)
  const rest = n % 1e3
  return [
    crore ? inWords(crore) + ' Crore' : '',
    lakh ? twoDigits(lakh) + ' Lakh' : '',
    thousand ? twoDigits(thousand) + ' Thousand' : '',
    rest ? threeDigits(rest) : '',
  ].filter(Boolean).join(' ')
}

export function rupeesInWords(v: unknown): string {
  const n = num(v)
  const r = Math.floor(Math.abs(n))
  const p = Math.round((Math.abs(n) - r) * 100)
  return `Rupees ${inWords(r)}${p ? ` and ${twoDigits(p)} Paise` : ''} Only`
}

export const STATES: Record<string, string> = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana',
  '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland',
  '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand',
  '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat', '26': 'Dadra & Nagar Haveli and Daman & Diu',
  '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman & Nicobar', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
}

export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

export function initials(name?: string | null) {
  return (name ?? '?').split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
}

export function phoneLink(p?: string | null) {
  const d = (p ?? '').replace(/\D/g, '')
  return d.length === 10 ? `+91${d}` : d ? `+${d}` : ''
}
export function whatsappLink(p?: string | null, text = '') {
  const d = (p ?? '').replace(/\D/g, '')
  const n = d.length === 10 ? `91${d}` : d
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}
