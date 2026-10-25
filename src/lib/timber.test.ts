import { describe, expect, it } from 'vitest'
import { billTotals, hoppusCft, sawnCft, trueLogCft, yieldPct } from './timber'
import { inWords, rupeesInWords, size } from './format'

// These figures were checked against the database functions in supabase/migrations (see scenario test).
describe('timber measurement', () => {
  it('sawn CFT = T × W × L × pcs / 144', () => {
    expect(sawnCft(5, 3, 8, 20)).toBe(16.667)
    expect(sawnCft(4, 2, 10, 12)).toBe(6.667)
    expect(sawnCft(5, 3, 8, 0)).toBe(0)
  })
  it('Hoppus log volume with bark allowance', () => {
    expect(hoppusCft(60, 12, 2)).toBe(17.521)
    expect(hoppusCft(52, 10)).toBe(11.736)
  })
  it('Hoppus is π/4 of true volume', () => {
    expect(hoppusCft(60, 12) / trueLogCft(60, 12)).toBeCloseTo(Math.PI / 4, 2)
  })
  it('yield', () => {
    expect(yieldPct(17.521, 10)).toBe(57.07)
  })
})

describe('bill arithmetic matches post_sale()', () => {
  it('spreads bill discount and splits GST', () => {
    const b = billTotals(
      [
        { qty: 4.167, rate: 4200, gstRate: 18 },
        { qty: 64, rate: 95, gstRate: 18 },
        { qty: 1, rate: 300, gstRate: 18 },
      ],
      500,
      false,
    )
    expect(b.subtotal).toBe(23881.4)
    expect(b.taxable).toBe(23381.4)
    expect(b.lines[0].taxable).toBe(17134.98)
    expect(b.cgst).toBe(2104.32)
    expect(b.sgst).toBe(2104.32)
    expect(b.total).toBe(27590)
    expect(b.roundOff).toBe(-0.04)
  })
  it('IGST for another state', () => {
    const b = billTotals([{ qty: 0.833, rate: 4200, gstRate: 18 }], 0, true)
    expect(b.igst).toBe(629.75)
    expect(b.total).toBe(4128)
  })
})

describe('Indian formats', () => {
  it('amount in words', () => {
    expect(inWords(27590)).toBe('Twenty Seven Thousand Five Hundred Ninety')
    expect(inWords(12345678)).toBe('One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight')
    expect(rupeesInWords(1001.5)).toBe('Rupees One Thousand One and Fifty Paise Only')
  })
  it('trade sizes', () => {
    expect(size(1.5)).toBe('1½')
    expect(size(0.75)).toBe('¾')
    expect(size(5)).toBe('5')
  })
})
