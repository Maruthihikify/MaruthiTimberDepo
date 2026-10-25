import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { ArrowDownLeft, ArrowUpRight, Layers, SlidersHorizontal } from 'lucide-react'
import { must, rpc, supabase } from '../../lib/supabase'
import { invalidateBusiness } from '../../lib/queryClient'
import { useAuth } from '../../lib/auth'
import { cft, dateTime, fmt, rupees, rupeesShort, sectionLabel, size } from '../../lib/format'
import { UOM_LABEL } from '../../lib/timber'
import { plankUrl, toneFor } from '../../lib/wood'
import { useProducts, useSawnStock, useSpecies } from '../data'
import { Chip, Empty, Field, Meter, Modal, PageHeader, SearchBox, SkeletonRows, Tabs, Money } from '../../components/ui'
import { RingSpinner } from '../../components/Loader'
import { toast } from '../../components/Toast'
import type { SawnStockRow } from '../types'

type Tab = 'sawn' | 'items' | 'moves'

export default function Stock() {
  const [sp, setSp] = useSearchParams()
  const { can } = useAuth()
  const money = can('manager', 'accounts')
  const tab = (sp.get('tab') as Tab) || 'sawn'
  const [q, setQ] = useState(sp.get('q') ?? '')
  const [speciesFilter, setSpeciesFilter] = useState<string | null>(null)
  const lowOnly = sp.get('low') === '1'
  const stock = useSawnStock()
  const species = useSpecies()
  const products = useProducts()
  const [adjust, setAdjust] = useState<{ product_id: string; name: string; length_ft?: number; kind: 'sawn' | 'product' } | null>(null)

  const groups = useMemo(() => {
    const t = q.trim().toLowerCase().replace('*', 'x')
    const rows = (stock.data ?? []).filter((r) => !speciesFilter || r.species_id === speciesFilter)
      .filter((r) => !t || `${r.name} ${size(r.thickness_in)}x${size(r.width_in)} ${r.thickness_in}x${r.width_in} ${r.bay ?? ''}`.toLowerCase().includes(t))
    const bySpecies = new Map<string, { id: string; name: string; color: string; grain: string; cft: number; value: number; sections: Map<string, { product: SawnStockRow; lengths: Map<number, number>; cft: number }> }>()
    for (const r of rows) {
      if (!bySpecies.has(r.species_id)) bySpecies.set(r.species_id, { id: r.species_id, name: r.species_name, color: r.color_hex, grain: r.grain_hex, cft: 0, value: 0, sections: new Map() })
      const g = bySpecies.get(r.species_id)!
      g.cft += Number(r.cft); g.value += Number(r.cft) * Number(r.avg_cost)
      if (!g.sections.has(r.product_id)) g.sections.set(r.product_id, { product: r, lengths: new Map(), cft: 0 })
      const s = g.sections.get(r.product_id)!
      s.lengths.set(Number(r.length_ft), r.pieces); s.cft += Number(r.cft)
    }
    let list = [...bySpecies.values()]
    if (lowOnly) list = list.map((g) => ({ ...g, sections: new Map([...g.sections].filter(([, s]) => Number(s.product.min_stock) > 0 && s.cft < Number(s.product.min_stock))) })).filter((g) => g.sections.size)
    return list.sort((a, b) => b.cft - a.cft)
  }, [stock.data, q, speciesFilter, lowOnly])

  const total = groups.reduce((a, g) => ({ cft: a.cft + g.cft, value: a.value + g.value, sizes: a.sizes + g.sections.size }), { cft: 0, value: 0, sizes: 0 })
  const items = (products.data ?? []).filter((p) => ['panel', 'unit', 'byproduct'].includes(p.kind) && p.active)

  return (
    <div>
      <PageHeader icon={<Layers className="size-5" />} title="Timber stock" subtitle="Sawn sizes by length, plywood, doors and byproducts — live from every bill, purchase and saw run" />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Tabs value={tab} onChange={(v) => setSp((s) => { s.set('tab', v); return s })} items={[{ value: 'sawn', label: 'Sawn timber' }, { value: 'items', label: 'Plywood, doors & more' }, { value: 'moves', label: 'Movements' }]} />
        {tab === 'sawn' && <SearchBox value={q} onChange={setQ} placeholder="Size like 5x3, species, bay…" className="lg:ml-auto lg:w-72" />}
      </div>

      {tab === 'sawn' && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Sawn timber" value={`${fmt(total.cft, 1)} CFT`} sub={`${fmt(total.cft / 35.3147, 2)} m³`} />
            <Tile label="Sizes in stock" value={String(total.sizes)} sub={`${groups.length} species`} />
            {money && <Tile label="Value at cost" value={rupeesShort(total.value)} sub="weighted average" />}
            {lowOnly ? <button className="card p-4 text-left" onClick={() => setSp((s) => { s.delete('low'); return s })}><p className="text-xs font-bold uppercase tracking-wider text-ember-600">Showing low stock</p><p className="text-sm font-semibold text-ink-soft">Tap to show all</p></button>
              : <button className="card p-4 text-left hover:border-teak-300" onClick={() => setSp((s) => { s.set('low', '1'); return s })}><p className="text-xs font-bold uppercase tracking-wider text-ink-mute">Low stock</p><p className="text-sm font-semibold text-teak-700">Show sizes below minimum →</p></button>}
          </div>
          <div className="no-scrollbar -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1">
            <button onClick={() => setSpeciesFilter(null)} className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold ${!speciesFilter ? 'bg-teak-500 text-white shadow-glow' : 'bg-paper text-ink-soft ring-1 ring-line'}`}>All species</button>
            {(species.data ?? []).filter((s) => (stock.data ?? []).some((r) => r.species_id === s.id)).map((s) => (
              <button key={s.id} onClick={() => setSpeciesFilter(s.id === speciesFilter ? null : s.id)} className={`flex shrink-0 items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs font-bold transition ${speciesFilter === s.id ? 'bg-teak-50 text-teak-800 ring-2 ring-teak-400' : 'bg-paper text-ink-soft ring-1 ring-line hover:ring-teak-300'}`}>
                <span className="h-4 w-7 rounded bg-cover ring-1 ring-black/10" style={{ backgroundImage: `url(${plankUrl(toneFor(s.name, s.color_hex, s.grain_hex, 2), 112, 24)})` }} />{s.name}
              </button>
            ))}
          </div>

          {stock.isLoading ? <div className="card"><SkeletonRows rows={8} /></div> : groups.length === 0 ? (
            <div className="card"><Empty icon={<Layers className="size-7" />} title={lowOnly ? 'Nothing below minimum' : 'No sawn timber matches'} body="Purchases and sawmill runs add timber here." /></div>
          ) : (
            <div className="space-y-5">
              {groups.map((g, gi) => {
                const lengths = [...new Set([...g.sections.values()].flatMap((s) => [...s.lengths.keys()]))].sort((a, b) => a - b)
                const tex = plankUrl(toneFor(g.name, g.color, g.grain, 5 + gi), 900, 90)
                return (
                  <motion.section key={g.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(gi * 0.05, 0.4) }} className="card overflow-hidden">
                    <div className="relative flex flex-wrap items-center gap-4 px-4 py-3.5 sm:px-5" style={{ backgroundImage: `url(${tex})`, backgroundSize: 'cover' }}>
                      <div className="absolute inset-0 bg-gradient-to-r from-[#2b1c11]/55 via-[#2b1c11]/25 to-transparent" />
                      <TimberStack tex={tex} layers={Math.max(2, Math.min(7, Math.round(g.cft / 25)))} />
                      <div className="relative min-w-0 flex-1 text-white">
                        <p className="font-display text-xl font-semibold drop-shadow">{g.name}</p>
                        <p className="text-xs font-semibold text-white/90 drop-shadow">{g.sections.size} sizes · {fmt(g.cft, 1)} CFT{money ? ` · ${rupees(g.value)} at cost` : ''}</p>
                      </div>
                    </div>
                    <div className="hidden overflow-x-auto md:block">
                      <table className="table-x">
                        <thead>
                          <tr>
                            <th>Size</th>
                            {lengths.map((l) => <th key={l} className="text-center">{size(l)} ft</th>)}
                            <th className="text-right">Pcs</th><th className="text-right">CFT</th><th className="text-right">Rate/CFT</th>{money && <th className="text-right">Cost/CFT</th>}<th>Bay</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...g.sections.values()].sort((a, b) => b.product.thickness_in * b.product.width_in - a.product.thickness_in * a.product.width_in).map((s) => {
                            const low = Number(s.product.min_stock) > 0 && s.cft < Number(s.product.min_stock)
                            return (
                              <tr key={s.product.product_id}>
                                <td className="whitespace-nowrap font-bold">{sectionLabel(s.product.thickness_in, s.product.width_in)}{s.product.grade && <span className="ml-1.5 text-xs font-semibold text-ink-soft">{s.product.grade}</span>}{low && <Chip tone="red">low</Chip>}</td>
                                {lengths.map((l) => {
                                  const pcs = s.lengths.get(l)
                                  return (
                                    <td key={l} className="text-center">
                                      {pcs ? (
                                        <button disabled={!can('manager')} onClick={() => setAdjust({ product_id: s.product.product_id, name: s.product.name, length_ft: l, kind: 'sawn' })}
                                          className="num min-w-10 rounded-lg bg-teak-50 px-2 py-1 font-bold text-teak-800 ring-1 ring-teak-100 transition enabled:hover:bg-teak-100" title={cft(Number(s.product.thickness_in) * Number(s.product.width_in) * l * pcs / 144)}>{pcs}</button>
                                      ) : <span className="text-ink-mute/50">·</span>}
                                    </td>
                                  )
                                })}
                                <td className="num text-right font-semibold">{[...s.lengths.values()].reduce((a, b) => a + b, 0)}</td>
                                <td className="num text-right font-bold">{fmt(s.cft, 2)}</td>
                                <td className="text-right"><Money value={s.product.sale_rate} /></td>
                                {money && <td className="text-right text-ink-soft"><Money value={s.product.avg_cost} /></td>}
                                <td className="text-xs text-ink-soft">{s.product.bay ?? '—'}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    <ul className="divide-y divide-line md:hidden">
                      {[...g.sections.values()].map((s) => (
                        <li key={s.product.product_id} className="px-4 py-3">
                          <div className="flex items-center justify-between">
                            <span className="font-bold">{sectionLabel(s.product.thickness_in, s.product.width_in)} <span className="text-xs text-ink-soft">{s.product.grade}</span></span>
                            <span className="num text-sm font-bold">{fmt(s.cft, 2)} CFT · <Money value={s.product.sale_rate} />/cft</span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {[...s.lengths.entries()].sort((a, b) => a[0] - b[0]).map(([l, pcs]) => <span key={l} className="num rounded-lg bg-teak-50 px-2 py-1 text-xs font-bold text-teak-800">{size(l)} ft × {pcs}</span>)}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </motion.section>
                )
              })}
            </div>
          )}
        </>
      )}

      {tab === 'items' && (
        <div className="card overflow-hidden">
          {products.isLoading ? <SkeletonRows /> : (
            <div className="overflow-x-auto">
              <table className="table-x">
                <thead><tr><th>Item</th><th className="text-right">In stock</th><th className="w-40">Level</th><th className="text-right">Sale rate</th>{money && <th className="text-right">Value at cost</th>}<th>Bay</th>{can('manager') && <th />}</tr></thead>
                <tbody>
                  {items.map((p) => {
                    const unit = p.kind === 'panel' ? 'sheets' : UOM_LABEL[p.uom] ?? p.uom
                    const value = (p.kind === 'panel' ? Number(p.qty_on_hand) * Number(p.sheet_sqft) : Number(p.qty_on_hand)) * Number(p.avg_cost)
                    const low = Number(p.min_stock) > 0 && Number(p.qty_on_hand) < Number(p.min_stock)
                    return (
                      <tr key={p.id}>
                        <td><p className="font-semibold">{p.name}</p><p className="text-xs capitalize text-ink-soft">{p.kind === 'panel' ? `${fmt(p.sheet_sqft)} sq.ft per sheet` : p.kind}</p></td>
                        <td className={`num text-right font-bold ${low ? 'text-ember-600' : ''}`}>{fmt(p.qty_on_hand, 2)} <span className="text-xs font-semibold text-ink-soft">{unit}</span></td>
                        <td><Meter value={Number(p.qty_on_hand)} max={Math.max(Number(p.min_stock) * 3, Number(p.qty_on_hand), 1)} tone={low ? 'ember' : 'leaf'} /></td>
                        <td className="text-right"><Money value={p.sale_rate} /><span className="text-xs text-ink-mute">/{UOM_LABEL[p.uom] ?? p.uom}</span></td>
                        {money && <td className="text-right"><Money value={value} /></td>}
                        <td className="text-xs text-ink-soft">{p.bay ?? '—'}</td>
                        {can('manager') && <td className="text-right"><button className="btn-soft btn-sm" onClick={() => setAdjust({ product_id: p.id, name: p.name, kind: 'product' })}><SlidersHorizontal className="size-3.5" /> Adjust</button></td>}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'moves' && <Movements />}

      <AdjustModal target={adjust} onClose={() => setAdjust(null)} />
    </div>
  )
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <p className="text-[11px] font-bold uppercase tracking-wider text-ink-mute">{label}</p>
      <p className="num mt-1 font-display text-2xl font-semibold">{value}</p>
      {sub && <p className="text-xs font-semibold text-ink-soft">{sub}</p>}
    </div>
  )
}

/** A little seasoning stack: boards with sticker battens between layers. */
function TimberStack({ tex, layers }: { tex: string; layers: number }) {
  return (
    <div className="relative hidden h-16 w-28 shrink-0 sm:block" aria-hidden>
      {Array.from({ length: layers }, (_, i) => (
        <motion.div key={i} initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.07, type: 'spring', stiffness: 260, damping: 18 }}
          className="absolute left-0 right-0 h-[7px] rounded-[2px] shadow-[0_2px_3px_rgba(43,28,17,0.45)]"
          style={{ bottom: i * 9, backgroundImage: `url(${tex})`, backgroundSize: '400% 900%', backgroundPosition: `${i * 23}% ${i * 31}%`, transform: `skewX(-18deg) translateX(${i % 2 ? 3 : 0}px)` }}>
          {i > 0 && [12, 50, 86].map((x) => <span key={x} className="absolute -bottom-[2px] h-[2px] w-[6px] bg-[#5a3a22]" style={{ left: `${x}%` }} />)}
        </motion.div>
      ))}
    </div>
  )
}

function Movements() {
  const moves = useQuery({
    queryKey: ['stock', 'moves'],
    queryFn: async () => must(await supabase.from('stock_moves').select('*, products(name), logs(log_no, species(name))').order('moved_at', { ascending: false }).limit(250)) as unknown as {
      id: number; moved_at: string; move_date: string; qty: number; pieces: number | null; length_ft: number | null; ref_type: string; ref_no: string | null; note: string | null
      products: { name: string } | null; logs: { log_no: string; species: { name: string } } | null
    }[],
  })
  const label: Record<string, string> = { purchase: 'Purchase', purchase_cancel: 'Purchase cancelled', conversion_in: 'To saw', conversion_out: 'From saw', sale: 'Sold', sale_cancel: 'Bill cancelled', credit_note: 'Returned', adjustment: 'Adjustment' }
  return (
    <div className="card overflow-hidden">
      {moves.isLoading ? <SkeletonRows /> : !moves.data?.length ? <Empty title="No movements yet" /> : (
        <ul className="divide-y divide-line/70">
          {moves.data.map((m) => {
            const inward = Number(m.qty) > 0
            return (
              <li key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className={`grid size-8 shrink-0 place-items-center rounded-xl ${inward ? 'bg-leaf-50 text-leaf-600' : 'bg-ember-50 text-ember-600'}`}>{inward ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{m.products?.name ?? (m.logs ? `${m.logs.species.name} log #${m.logs.log_no}` : '—')}{m.length_ft ? ` × ${size(m.length_ft)} ft` : ''}</span>
                  <span className="text-xs text-ink-soft">{label[m.ref_type] ?? m.ref_type}{m.ref_no ? ` · ${m.ref_no}` : ''}{m.note ? ` · ${m.note}` : ''} · {dateTime(m.moved_at)}</span>
                </span>
                <span className={`num text-right text-sm font-bold ${inward ? 'text-leaf-600' : 'text-ember-600'}`}>{inward ? '+' : ''}{m.pieces !== null ? fmt(m.pieces, 2) : ''}<span className="block text-[11px] font-semibold text-ink-soft">{fmt(m.qty, 3)}</span></span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function AdjustModal({ target, onClose }: { target: { product_id: string; name: string; length_ft?: number; kind: 'sawn' | 'product' } | null; onClose: () => void }) {
  const [delta, setDelta] = useState<number | ''>('')
  const [len, setLen] = useState<number | ''>('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const open = !!target
  const key = target ? `${target.product_id}-${target.length_ft}` : ''
  const [lastKey, setLastKey] = useState('')
  if (open && key !== lastKey) { setLastKey(key); setDelta(''); setLen(target?.length_ft ?? ''); setReason('') }
  async function save() {
    if (!target) return
    if (!delta) return toast.error('Enter + or − quantity')
    if (reason.trim().length < 3) return toast.error('Give a reason')
    setBusy(true)
    try {
      await rpc('adjust_stock', { p: target.kind === 'sawn' ? { target: 'sawn', product_id: target.product_id, length_ft: len, pieces_delta: delta, reason } : { target: 'product', product_id: target.product_id, qty_delta: delta, reason } })
      invalidateBusiness()
      toast.success('Stock adjusted')
      onClose()
    } catch (e) { toast.error('Not adjusted', (e as Error).message) } finally { setBusy(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title={`Adjust · ${target?.name ?? ''}`}
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy} onClick={save}>{busy && <RingSpinner size={16} />} Save adjustment</button></>}>
      <p className="mb-4 text-sm text-ink-soft">Use after a physical count, damage or theft. Every adjustment is kept in Movements with your reason.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {target?.kind === 'sawn' && <Field label="Length (ft)"><input className="input num" type="number" step={0.5} value={len} onChange={(e) => setLen(e.target.value === '' ? '' : Number(e.target.value))} /></Field>}
        <Field label={target?.kind === 'sawn' ? 'Pieces (+ add / − remove)' : 'Quantity (+ / −)'}><input className="input num" type="number" value={delta} onChange={(e) => setDelta(e.target.value === '' ? '' : Number(e.target.value))} placeholder="-2" /></Field>
        <Field label="Reason *" className="sm:col-span-2"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Physical count 25 Oct · 2 pcs split while drying" /></Field>
      </div>
    </Modal>
  )
}
