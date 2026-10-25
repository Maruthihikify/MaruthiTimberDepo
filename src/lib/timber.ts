// Timber trade arithmetic. These mirror the database functions (sawn_cft, hoppus_cft) exactly,
// so what the counter sees while typing is what the bill will say.

export const CFT_PER_CBM = 35.3147

const r3 = (n: number) => Math.round(n * 1000) / 1000
const r2 = (n: number) => Math.round(n * 100) / 100

/** Sawn timber volume: thickness (in) × width (in) × length (ft) × pieces / 144 */
export function sawnCft(t: number, w: number, lengthFt: number, pieces = 1): number {
  if (!(t > 0 && w > 0 && lengthFt > 0 && pieces > 0)) return 0
  return r3((t * w * lengthFt * pieces) / 144)
}

/** Round log volume by Hoppus (quarter-girth) rule: ((girth − bark)/4)² × length / 144, girth in inches, length in feet */
export function hoppusCft(girthIn: number, lengthFt: number, barkAllowanceIn = 0): number {
  const g = girthIn - barkAllowanceIn
  if (!(g > 0 && lengthFt > 0)) return 0
  return r3(((g / 4) * (g / 4) * lengthFt) / 144)
}

/** True (geometric) volume of the same log, for showing how Hoppus under-measures by π/4 */
export function trueLogCft(girthIn: number, lengthFt: number): number {
  if (!(girthIn > 0 && lengthFt > 0)) return 0
  const radiusFt = girthIn / 12 / (2 * Math.PI)
  return r3(Math.PI * radiusFt * radiusFt * lengthFt)
}

export const cmToIn = (cm: number) => cm / 2.54
export const mToFt = (m: number) => m * 3.28084
export const cftToCbm = (c: number) => r3(c / CFT_PER_CBM)

export function panelSqft(lengthFt: number, widthFt: number, sheets = 1) {
  return r3(lengthFt * widthFt * sheets)
}

/** Running feet of a moulding/beading */
export const rft = (lengthFt: number, pieces = 1) => r3(lengthFt * pieces)

export function yieldPct(inputCft: number, outputCft: number) {
  return inputCft > 0 ? r2((outputCft / inputCft) * 100) : 0
}

/** The 4 common sawing patterns, used by the sawmill planner to suggest cuts from a log's diameter */
export function usableSquareSide(girthIn: number, barkAllowanceIn = 0) {
  const d = (girthIn - barkAllowanceIn) / Math.PI // diameter in inches
  return Math.floor((d / Math.SQRT2) * 4) / 4 // largest square beam, to the nearest ¼"
}

export interface LineCalc {
  qty: number
  amount: number
  taxable: number
  cgst: number
  sgst: number
  igst: number
}

/**
 * Bill arithmetic identical to post_sale(): line amount → bill discount spread by value (largest line takes the paise)
 * → GST per line (CGST/SGST halves, or IGST) → rounded total.
 */
export function billTotals(
  lines: { qty: number; rate: number; discountPct?: number; gstRate: number }[],
  billDiscount: number,
  interstate: boolean,
) {
  const amounts = lines.map((l) => r2(l.qty * l.rate * (1 - (l.discountPct ?? 0) / 100)))
  const subtotal = r2(amounts.reduce((a, b) => a + b, 0))
  const disc = Math.min(Math.max(billDiscount || 0, 0), subtotal)
  const taxables = amounts.map((a) => (subtotal > 0 ? r2(a - r2((disc * a) / subtotal)) : a))
  const diff = r2(disc - (subtotal - taxables.reduce((a, b) => a + b, 0)))
  if (diff !== 0 && taxables.length) {
    let big = 0
    amounts.forEach((a, i) => { if (a > amounts[big]) big = i })
    taxables[big] = r2(taxables[big] - diff)
  }
  const per: LineCalc[] = lines.map((l, i) => {
    const t = taxables[i]
    return {
      qty: l.qty,
      amount: amounts[i],
      taxable: t,
      cgst: interstate ? 0 : r2((t * l.gstRate) / 200),
      sgst: interstate ? 0 : r2((t * l.gstRate) / 200),
      igst: interstate ? r2((t * l.gstRate) / 100) : 0,
    }
  })
  const taxable = r2(per.reduce((a, p) => a + p.taxable, 0))
  const cgst = r2(per.reduce((a, p) => a + p.cgst, 0))
  const sgst = r2(per.reduce((a, p) => a + p.sgst, 0))
  const igst = r2(per.reduce((a, p) => a + p.igst, 0))
  const grand = r2(taxable + cgst + sgst + igst)
  const total = Math.round(grand)
  return { lines: per, subtotal, discount: disc, taxable, cgst, sgst, igst, roundOff: r2(total - grand), total }
}

export const LINE_KINDS = {
  sawn: 'Sawn timber',
  log: 'Round log',
  panel: 'Plywood / board',
  unit: 'Door / frame / item',
  service: 'Service / charges',
  byproduct: 'Firewood / byproduct',
} as const
export type LineKind = keyof typeof LINE_KINDS

export const UOM_LABEL: Record<string, string> = {
  cft: 'CFT', sqft: 'sq.ft', nos: 'nos', rft: 'rft', kg: 'kg', load: 'load', job: 'job',
}

export const STANDARD_LENGTHS = [3, 4, 5, 6, 6.5, 7, 7.5, 8, 9, 10, 11, 12, 13, 14, 15, 16]
export const STANDARD_SECTIONS: [number, number][] = [
  [1, 1], [1.5, 1], [2, 1], [2, 1.5], [2, 2], [3, 1], [3, 2], [3, 3], [4, 1], [4, 2], [4, 3], [4, 4],
  [5, 2.5], [5, 3], [6, 1], [6, 2], [6, 3], [6, 4], [8, 1], [8, 2], [9, 1], [10, 1], [12, 1],
]
