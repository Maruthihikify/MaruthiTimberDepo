import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { Check, Cog, Plus, Trash2, TreePine } from 'lucide-react'
import { rpc } from '../../lib/supabase'
import { invalidateBusiness } from '../../lib/queryClient'
import { useAuth } from '../../lib/auth'
import { fmt, rupees, sectionLabel, size, todayIST } from '../../lib/format'
import { sawnCft, usableSquareSide, STANDARD_SECTIONS, STANDARD_LENGTHS } from '../../lib/timber'
import { endGrainUrl, toneFor } from '../../lib/wood'
import { useProducts, useYardLogs } from '../data'
import { Chip, Empty, Field, PageHeader } from '../../components/ui'
import { Gauge } from '../../components/Charts'
import { RingSpinner } from '../../components/Loader'
import { toast } from '../../components/Toast'
import type { Log } from '../types'

interface Out { key: number; t: number; w: number; grade: string; length_ft: number; pieces: number }
let k = 1

export default function SawmillNew() {
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const { can } = useAuth()
  const money = can('manager', 'accounts')
  const yard = useYardLogs()
  const products = useProducts()
  const [picked, setPicked] = useState<Set<string>>(() => new Set((sp.get('logs') ?? '').split(',').filter(Boolean)))
  const [outs, setOuts] = useState<Out[]>([])
  const [processing, setProcessing] = useState<number | ''>('')
  const [firewood, setFirewood] = useState<number | ''>('')
  const [sawdust, setSawdust] = useState<number | ''>('')
  const [operator, setOperator] = useState('')
  const [date, setDate] = useState(todayIST())
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ ref_no: string; yield_pct: number; cost_per_cft: number } | null>(null)

  const logs = yard.data ?? []
  const chosen = logs.filter((l) => picked.has(l.id))
  const sp0 = chosen[0]?.species_id
  const sp0Name = chosen[0]?.species?.name ?? ''
  const inCft = chosen.reduce((a, l) => a + Number(l.cft), 0)
  const inCost = chosen.reduce((a, l) => a + Number(l.cft) * Number(l.cost_per_cft), 0)
  const minLen = chosen.length ? Math.min(...chosen.map((l) => Number(l.length_ft))) : 16
  const outCft = outs.reduce((a, o) => a + sawnCft(o.t, o.w, o.length_ft, o.pieces), 0)
  const yieldPct = inCft > 0 ? (outCft / inCft) * 100 : 0
  const fwKg = firewood === '' ? Math.max(0, Math.round((inCft - outCft) * 9)) : Number(firewood)
  const proc = processing === '' ? Math.round(inCft * 110) : Number(processing)
  const fwRate = Number((products.data ?? []).find((p) => p.kind === 'byproduct' && p.uom === 'kg')?.sale_rate ?? 0)
  const costPerCft = outCft > 0 ? Math.max(0, inCost + proc - fwKg * fwRate) / outCft : 0
  const tooMuch = inCft > 0 && outCft > inCft * 1.273
  const biggest = chosen.reduce<Log | null>((a, l) => (!a || Number(l.girth_in) > Number(a.girth_in) ? l : a), null)

  const sections = useMemo(() => {
    const existing = (products.data ?? []).filter((p) => p.kind === 'sawn' && p.species_id === sp0).map((p) => [Number(p.thickness_in), Number(p.width_in)] as [number, number])
    const all = [...existing, ...STANDARD_SECTIONS]
    return all.filter((s, i) => all.findIndex((x) => x[0] === s[0] && x[1] === s[1]) === i).sort((a, b) => b[0] * b[1] - a[0] * a[1])
  }, [products.data, sp0])

  const toggle = (l: Log) => setPicked((s) => {
    const n = new Set(s)
    if (n.has(l.id)) n.delete(l.id)
    else {
      if (chosen.length && l.species_id !== sp0) { toast.info('One species per run', 'Saw different species in separate runs so each gets its own cost.'); return s }
      n.add(l.id)
    }
    return n
  })
  const addOut = (t: number, w: number) => setOuts((o) => [...o, { key: k++, t, w, grade: 'A', length_ft: Math.min(8, minLen), pieces: 1 }])

  async function save() {
    if (!chosen.length) return toast.error('Pick the logs going to the saw')
    if (!outs.length || outCft <= 0) return toast.error('Add the sizes that came out')
    if (tooMuch) return toast.error('Output is more than the logs can give', 'Check pieces and sizes')
    setBusy(true)
    try {
      const r = await rpc<{ ref_no: string; yield_pct: number; cost_per_cft: number }>('post_conversion', { p: {
        conv_date: date, operator: operator || null, notes: notes || null, processing_cost: proc, firewood_kg: fwKg, sawdust_bags: sawdust === '' ? Math.round(inCft / 3) : Number(sawdust),
        logs: chosen.map((l) => l.id),
        outputs: outs.map((o) => ({ species_id: sp0, grade: o.grade || null, thickness_in: o.t, width_in: o.w, length_ft: o.length_ft, pieces: o.pieces })),
      } })
      invalidateBusiness()
      setDone(r)
    } catch (e) { toast.error('Saw run not saved', (e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div>
      <PageHeader icon={<Cog className="size-5" />} title="New saw run" subtitle="Pick logs, record the sizes that came off the saw — stock, recovery and cost update instantly" />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <section className="card p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">1 · Logs to the saw</h3>
              {chosen.length > 0 && <Chip tone="brown">{chosen.length} logs · {fmt(inCft, 3)} CFT Hoppus</Chip>}
            </div>
            {yard.isLoading ? <div className="skeleton h-32" /> : !logs.length ? <Empty icon={<TreePine className="size-7" />} title="No logs in the yard" /> : (
              <div className="grid max-h-[340px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
                {logs.map((l) => {
                  const on = picked.has(l.id)
                  const off = chosen.length > 0 && l.species_id !== sp0
                  return (
                    <button key={l.id} onClick={() => toggle(l)} className={`relative flex items-center gap-2.5 rounded-2xl border p-2.5 text-left transition-all ${on ? 'border-teak-400 bg-teak-50 shadow-card' : off ? 'border-line opacity-40' : 'border-line bg-paper hover:border-teak-300'}`}>
                      <img src={endGrainUrl({ ...toneFor(l.species?.name ?? '', l.species?.color_hex, l.species?.grain_hex, Number(l.log_no.replace(/\D/g, '')) % 17), rings: 6 }, 72)} alt="" className="size-10 shrink-0 rounded-full shadow" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold">#{l.log_no}</span>
                        <span className="block truncate text-[11px] text-ink-soft">{l.species?.name}</span>
                        <span className="num block text-[11px] font-semibold text-ink-soft">{size(l.length_ft)}′ × {size(l.girth_in)}″ · {fmt(l.cft, 2)}</span>
                      </span>
                      {on && <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-teak-500 text-white"><Check className="size-3" /></span>}
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          <section className="card p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-lg font-semibold">2 · Sizes that came out</h3>
              {sp0Name && <span className="text-xs font-semibold text-ink-soft">{sp0Name} · logs up to {size(minLen)} ft</span>}
            </div>
            <div className="no-scrollbar -mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {sections.slice(0, 18).map(([t, w]) => (
                <button key={`${t}x${w}`} onClick={() => addOut(t, w)} disabled={!chosen.length} className="btn-soft btn-sm shrink-0"><Plus className="size-3" /> {sectionLabel(t, w)}</button>
              ))}
            </div>
            {!outs.length ? <p className="rounded-2xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-soft">{chosen.length ? 'Tap a size above for each size that came off the saw.' : 'Pick logs first.'}</p> : (
              <div className="space-y-2">
                <AnimatePresence initial={false}>
                  {outs.map((o) => (
                    <motion.div key={o.key} layout initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} className="grid grid-cols-[1fr_auto] items-end gap-2 rounded-2xl border border-line p-3 sm:grid-cols-[1.2fr_0.7fr_1fr_0.8fr_auto_auto]">
                      <p className="col-span-2 font-bold sm:col-span-1">{sectionLabel(o.t, o.w)}<span className="block text-[11px] font-semibold text-ink-soft">{fmt(sawnCft(o.t, o.w, 1, 1), 4)} CFT per foot</span></p>
                      <Field label="Grade"><select className="input input-sm" value={o.grade} onChange={(e) => setOuts((x) => x.map((y) => y.key === o.key ? { ...y, grade: e.target.value } : y))}>{['A', 'B', 'C'].map((g) => <option key={g}>{g}</option>)}</select></Field>
                      <Field label="Length ft">
                        <select className="input input-sm" value={o.length_ft} onChange={(e) => setOuts((x) => x.map((y) => y.key === o.key ? { ...y, length_ft: Number(e.target.value) } : y))}>
                          {STANDARD_LENGTHS.filter((l) => l <= minLen).map((l) => <option key={l} value={l}>{size(l)}</option>)}
                        </select>
                      </Field>
                      <Field label="Pieces"><input className="input input-sm num" type="number" min={1} value={o.pieces} onChange={(e) => setOuts((x) => x.map((y) => y.key === o.key ? { ...y, pieces: Math.max(1, Math.round(Number(e.target.value))) } : y))} /></Field>
                      <span className="num pb-2 text-sm font-bold">{fmt(sawnCft(o.t, o.w, o.length_ft, o.pieces), 3)}</span>
                      <button className="mb-1 grid size-8 place-items-center rounded-lg text-ink-mute hover:bg-ember-50 hover:text-ember-600" onClick={() => setOuts((x) => x.filter((y) => y.key !== o.key))}><Trash2 className="size-4" /></button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </section>

          <section className="card grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
            <h3 className="font-display text-lg font-semibold sm:col-span-3">3 · Run details</h3>
            <Field label="Date"><input type="date" className="input" max={todayIST()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Sawyer / operator"><input className="input" value={operator} onChange={(e) => setOperator(e.target.value)} /></Field>
            {money && <Field label="Sawing cost ₹" hint={processing === '' ? `Suggested ₹110 × CFT = ${rupees(proc)}` : 'Labour + power for this run'}><input className="input num" type="number" min={0} value={processing} placeholder={String(proc)} onChange={(e) => setProcessing(e.target.value === '' ? '' : Number(e.target.value))} /></Field>}
            <Field label="Firewood / off-cuts kg" hint={firewood === '' ? 'Estimated from waste' : undefined}><input className="input num" type="number" min={0} value={firewood} placeholder={String(fwKg)} onChange={(e) => setFirewood(e.target.value === '' ? '' : Number(e.target.value))} /></Field>
            <Field label="Sawdust bags"><input className="input num" type="number" min={0} value={sawdust} placeholder={String(Math.round(inCft / 3))} onChange={(e) => setSawdust(e.target.value === '' ? '' : Number(e.target.value))} /></Field>
            <Field label="Notes"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Heart shake in GT-1012…" /></Field>
          </section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          <section className="card overflow-hidden">
            <div className="bg-gradient-to-br from-teak-50 to-cream p-4">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-mute">Cutting pattern · {biggest ? `log #${biggest.log_no}` : 'pick a log'}</p>
              <CutDiagram log={biggest} outs={outs} />
            </div>
            <div className="p-4">
              <Gauge value={yieldPct} label="Recovery on Hoppus CFT" />
              <dl className="mt-2 space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-ink-soft">Logs in (Hoppus)</dt><dd className="num font-semibold">{fmt(inCft, 3)} CFT</dd></div>
                <div className="flex justify-between"><dt className="text-ink-soft">Timber out</dt><dd className="num font-bold">{fmt(outCft, 3)} CFT</dd></div>
                <div className="flex justify-between"><dt className="text-ink-soft">Waste → firewood</dt><dd className="num">{fmt(Math.max(0, inCft - outCft), 2)} CFT · {fmt(fwKg, 0)} kg</dd></div>
                {money && <div className="flex justify-between border-t border-line pt-1.5"><dt className="font-semibold">Cost per sawn CFT</dt><dd className="num font-display text-lg font-bold text-teak-700">{outCft > 0 ? rupees(costPerCft) : '—'}</dd></div>}
              </dl>
              {tooMuch && <p className="mt-2 rounded-xl bg-ember-50 px-3 py-2 text-xs font-semibold text-ember-600">More than these logs can physically give — check sizes and pieces.</p>}
              {!tooMuch && yieldPct > 0 && yieldPct < 55 && <p className="mt-2 rounded-xl bg-sun-100 px-3 py-2 text-xs font-semibold text-sun-500">Low recovery — check for missing pieces or blade condition.</p>}
              <button className="btn-primary mt-4 w-full py-3" onClick={save} disabled={busy}>{busy ? <RingSpinner size={18} /> : <Cog className="size-5" />} Save saw run</button>
            </div>
          </section>
        </aside>
      </div>

      <AnimatePresence>
        {done && (
          <div className="fixed inset-0 z-[85] grid place-items-center p-4">
            <motion.div className="absolute inset-0 bg-teak-900/40 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 280, damping: 24 }} className="relative w-full max-w-sm rounded-3xl bg-paper p-7 text-center shadow-lift">
              <SawBlade />
              <p className="mt-3 font-display text-2xl font-semibold">{done.ref_no} saved</p>
              <p className="mt-1 text-sm text-ink-soft">Recovery <b className="text-leaf-600">{fmt(done.yield_pct, 1)}%</b>{money ? <> · cost <b className="text-teak-700">{rupees(done.cost_per_cft)}/CFT</b></> : null}</p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button className="btn-ghost" onClick={() => nav('/app/sawmill')}>All runs</button>
                <button className="btn-primary" onClick={() => nav('/app/stock')}>See stock</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Animated circular saw blade */
function SawBlade() {
  const teeth = 28
  const pts = Array.from({ length: teeth * 2 }, (_, i) => {
    const a = (i / (teeth * 2)) * Math.PI * 2
    const r = i % 2 ? 44 : 50
    return `${50 + Math.cos(a) * r},${50 + Math.sin(a) * r}`
  }).join(' ')
  return (
    <motion.svg viewBox="0 0 100 100" className="mx-auto size-24 drop-shadow-lg" animate={{ rotate: 360 }} transition={{ duration: 0.8, ease: 'linear', repeat: 2 }}>
      <defs><radialGradient id="steel" cx="40%" cy="35%" r="70%"><stop offset="0" stopColor="#F4F6F8" /><stop offset="0.6" stopColor="#B9C2CC" /><stop offset="1" stopColor="#8892A0" /></radialGradient></defs>
      <polygon points={pts} fill="url(#steel)" stroke="#6E7783" strokeWidth="0.6" />
      <circle cx="50" cy="50" r="12" fill="#C9762A" stroke="#85481B" strokeWidth="2" />
      <circle cx="50" cy="50" r="3" fill="#45261A" />
    </motion.svg>
  )
}

/** Cross-section of the largest log with the chosen sections laid out row by row inside the usable heartwood. */
function CutDiagram({ log, outs }: { log: Log | null; outs: Out[] }) {
  if (!log) return <div className="grid aspect-square place-items-center rounded-full border-2 border-dashed border-line-strong text-sm text-ink-mute">No log yet</div>
  const g = Number(log.girth_in) - Number(log.bark_allowance_in)
  const d = g / Math.PI // inches
  const V = 100
  const scale = 92 / d
  const R = (d / 2) * scale
  const square = usableSquareSide(Number(log.girth_in), Number(log.bark_allowance_in))
  // shelf-pack one piece of each output size (repeated by pieces, capped) inside the circle
  const pieces = outs.flatMap((o) => Array.from({ length: Math.min(o.pieces, 12) }, () => o)).sort((a, b) => b.t * b.w - a.t * a.w)
  const rects: { x: number; y: number; w: number; h: number; o: Out }[] = []
  const kerf = 0.25 * scale
  let y = 50 - R * 0.86
  let rowH = 0
  let x = 0
  let rowY = y
  const rowBounds = (yy: number, hh: number) => {
    const dy = Math.max(Math.abs(yy - 50), Math.abs(yy + hh - 50))
    const half = dy < R ? Math.sqrt(R * R - dy * dy) : 0
    return [50 - half, 50 + half]
  }
  for (const p of pieces) {
    const w = Math.max(p.t, p.w) * scale, h = Math.min(p.t, p.w) * scale
    let [lo, hi] = rowBounds(rowY, Math.max(rowH, h))
    if (x === 0) x = lo
    if (x + w > hi) { rowY += rowH + kerf; rowH = 0; [lo, hi] = rowBounds(rowY, h); x = lo }
    if (rowY + h > 50 + R * 0.95 || x + w > hi) continue
    rects.push({ x, y: rowY, w, h, o: p })
    x += w + kerf
    rowH = Math.max(rowH, h)
  }
  const img = endGrainUrl({ ...toneFor(log.species?.name ?? '', log.species?.color_hex, log.species?.grain_hex, 9), rings: 8 }, 360)
  return (
    <div>
      <svg viewBox={`0 0 ${V} ${V}`} className="mx-auto block w-full max-w-[300px]">
        <defs><clipPath id="logclip"><circle cx="50" cy="50" r={R + 2.5} /></clipPath></defs>
        <image href={img} x={50 - R - 2.5} y={50 - R - 2.5} width={(R + 2.5) * 2} height={(R + 2.5) * 2} clipPath="url(#logclip)" />
        <rect x={50 - (square * scale) / 2} y={50 - (square * scale) / 2} width={square * scale} height={square * scale} fill="none" stroke="#fff" strokeOpacity="0.55" strokeDasharray="1.5 1.5" strokeWidth="0.5" />
        {rects.map((r, i) => (
          <motion.rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx={0.4} fill="#FFE7C2" fillOpacity="0.55" stroke="#FFF7EA" strokeWidth="0.6"
            initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03 }} style={{ transformOrigin: `${r.x + r.w / 2}px ${r.y + r.h / 2}px` }} />
        ))}
      </svg>
      <p className="mt-2 text-center text-[11px] font-semibold text-ink-soft">Ø {fmt(d, 1)}″ under bark · largest square beam {size(square)}″ × {size(square)}″ · {fmt(Number(log.length_ft), 1)} ft long</p>
    </div>
  )
}
