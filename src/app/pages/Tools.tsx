import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { Calculator, Plus, Trash2 } from 'lucide-react'
import { fmt, rupees, size } from '../../lib/format'
import { cftToCbm, hoppusCft, sawnCft, trueLogCft, usableSquareSide } from '../../lib/timber'
import { endGrainUrl, plankUrl, toneFor } from '../../lib/wood'
import { useSpecies } from '../data'
import { Field, PageHeader, Segmented } from '../../components/ui'

interface Row { key: number; t: number; w: number; l: number; pcs: number }
let k = 2

export default function Tools() {
  const species = useSpecies()
  const [mode, setMode] = useState<'sawn' | 'log'>('sawn')
  const [sp, setSp] = useState('')
  const s = (species.data ?? []).find((x) => x.id === sp) ?? species.data?.[0]
  const [rows, setRows] = useState<Row[]>([{ key: 1, t: 5, w: 3, l: 7, pcs: 2 }])
  const [log, setLog] = useState({ g: 60, l: 12, bark: 2 })
  const totalCft = rows.reduce((a, r) => a + sawnCft(r.t, r.w, r.l, r.pcs), 0)
  const rate = mode === 'sawn' ? Number(s?.sawn_rate_cft ?? 0) : Number(s?.log_rate_cft ?? 0)
  const tex = useMemo(() => (s ? plankUrl(toneFor(s.name, s.color_hex, s.grain_hex, 3), 640, 120) : ''), [s])
  const hop = hoppusCft(log.g, log.l, log.bark)
  const tru = trueLogCft(log.g - log.bark, log.l)
  const r0 = rows[0]

  return (
    <div>
      <PageHeader icon={<Calculator className="size-5" />} title="CFT calculator" subtitle="Quick measurement at the counter or in the yard — same formulas as billing"
        actions={<Segmented value={mode} onChange={setMode} items={[{ value: 'sawn', label: 'Sawn timber' }, { value: 'log', label: 'Round log (Hoppus)' }]} />} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink-soft">Species</span>
        <select className="input input-sm w-auto" value={s?.id ?? ''} onChange={(e) => setSp(e.target.value)}>{(species.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        {s && <span className="text-sm text-ink-soft">List rate {rupees(rate)}/CFT</span>}
      </div>

      {mode === 'sawn' ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className="card p-4 sm:p-5">
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.key} className="grid grid-cols-[repeat(4,1fr)_auto_auto] items-end gap-2">
                  <Field label="Thick (in)"><input className="input input-sm num" type="number" step={0.25} min={0} value={r.t} onChange={(e) => setRows((x) => x.map((y) => y.key === r.key ? { ...y, t: Number(e.target.value) } : y))} /></Field>
                  <Field label="Width (in)"><input className="input input-sm num" type="number" step={0.25} min={0} value={r.w} onChange={(e) => setRows((x) => x.map((y) => y.key === r.key ? { ...y, w: Number(e.target.value) } : y))} /></Field>
                  <Field label="Length (ft)"><input className="input input-sm num" type="number" step={0.5} min={0} value={r.l} onChange={(e) => setRows((x) => x.map((y) => y.key === r.key ? { ...y, l: Number(e.target.value) } : y))} /></Field>
                  <Field label="Pieces"><input className="input input-sm num" type="number" min={1} value={r.pcs} onChange={(e) => setRows((x) => x.map((y) => y.key === r.key ? { ...y, pcs: Math.round(Number(e.target.value)) } : y))} /></Field>
                  <span className="num pb-2 text-sm font-bold">{fmt(sawnCft(r.t, r.w, r.l, r.pcs), 3)}</span>
                  <button className="mb-1 grid size-8 place-items-center rounded-lg text-ink-mute hover:bg-ember-50 hover:text-ember-600" onClick={() => setRows((x) => x.length > 1 ? x.filter((y) => y.key !== r.key) : x)}><Trash2 className="size-4" /></button>
                </div>
              ))}
            </div>
            <button className="btn-soft btn-sm mt-3" onClick={() => setRows((x) => [...x, { key: k++, t: x[x.length - 1].t, w: x[x.length - 1].w, l: x[x.length - 1].l, pcs: 1 }])}><Plus className="size-3.5" /> Add size</button>
            {/* a plank drawn to the proportions of the first size */}
            <div className="mt-8 flex justify-center" style={{ perspective: 900 }}>
              <motion.div animate={{ rotateX: 58, rotateZ: -24 }} className="relative" style={{ transformStyle: 'preserve-3d', width: Math.min(560, 40 * Math.max(1, r0.l)), height: Math.min(180, 18 * Math.max(0.5, r0.w)) }}>
                <motion.div layout className="absolute inset-0 rounded-sm shadow-[0_30px_40px_-10px_rgba(69,38,26,0.5)]" style={{ backgroundImage: `url(${tex})`, backgroundSize: 'cover' }} />
                <motion.div layout className="absolute left-0 top-full w-full origin-top" style={{ height: Math.min(80, 14 * Math.max(0.5, r0.t)), backgroundImage: `url(${tex})`, backgroundSize: 'cover', filter: 'brightness(0.78)', transform: 'rotateX(-90deg)' }} />
              </motion.div>
            </div>
            <p className="mt-6 text-center text-xs text-ink-soft">{size(r0.t)}″ × {size(r0.w)}″ × {size(r0.l)} ft = {fmt(sawnCft(r0.t, r0.w, r0.l, 1), 4)} CFT per piece</p>
          </section>
          <section className="card h-fit overflow-hidden">
            <div className="p-5" style={{ backgroundImage: `linear-gradient(90deg,rgba(43,28,17,.55),rgba(43,28,17,.15)),url(${tex})`, backgroundSize: 'cover' }}>
              <p className="text-[11px] font-bold uppercase tracking-widest text-white/85">Total volume</p>
              <p className="num font-display text-4xl font-semibold text-white drop-shadow">{fmt(totalCft, 3)} CFT</p>
              <p className="text-sm font-semibold text-white/90">{fmt(cftToCbm(totalCft), 3)} m³ · {rows.reduce((a, r) => a + r.pcs, 0)} pieces</p>
            </div>
            <dl className="space-y-2 p-5 text-sm">
              <div className="flex justify-between"><dt className="text-ink-soft">At list rate</dt><dd className="num font-bold">{rupees(totalCft * rate)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-soft">With 18% GST</dt><dd className="num font-bold">{rupees(totalCft * rate * 1.18)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-soft">Approx. weight</dt><dd className="num">{fmt((cftToCbm(totalCft) * Number(s?.density_kg_m3 ?? 650)), 0)} kg</dd></div>
              <p className="pt-2 text-xs text-ink-mute">CFT = thickness″ × width″ × length′ ÷ 144 for each piece.</p>
            </dl>
          </section>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className="card p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Mid girth (inches)" hint="Tape round the middle of the log"><input className="input num" type="number" step={0.5} value={log.g} onChange={(e) => setLog({ ...log, g: Number(e.target.value) })} /></Field>
              <Field label="Length (feet)"><input className="input num" type="number" step={0.5} value={log.l} onChange={(e) => setLog({ ...log, l: Number(e.target.value) })} /></Field>
              <Field label="Bark allowance (in)" hint="Usually 1–2″ for teak"><input className="input num" type="number" step={0.5} min={0} value={log.bark} onChange={(e) => setLog({ ...log, bark: Number(e.target.value) })} /></Field>
            </div>
            <div className="mt-8 flex items-center justify-center gap-8">
              <motion.img key={s?.id} initial={{ rotate: -40, scale: 0.8, opacity: 0 }} animate={{ rotate: 0, scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 120, damping: 14 }}
                src={endGrainUrl({ ...toneFor(s?.name ?? 'teak', s?.color_hex, s?.grain_hex, 7), rings: 7 }, 320)} alt="" className="rounded-full shadow-[0_24px_50px_-14px_rgba(69,38,26,0.6)]"
                style={{ width: Math.max(90, Math.min(260, log.g * 3)), height: Math.max(90, Math.min(260, log.g * 3)) }} />
              <div className="text-sm text-ink-soft">
                <p>Diameter ≈ <b className="text-ink">{fmt((log.g - log.bark) / Math.PI, 1)}″</b></p>
                <p>Biggest square beam ≈ <b className="text-ink">{size(usableSquareSide(log.g, log.bark))}″</b></p>
                <p>Quarter girth = <b className="text-ink">{fmt((log.g - log.bark) / 4, 2)}″</b></p>
              </div>
            </div>
          </section>
          <section className="card h-fit p-5">
            <p className="text-[11px] font-bold uppercase tracking-widest text-ink-mute">Hoppus volume</p>
            <p className="num font-display text-4xl font-semibold text-teak-700">{fmt(hop, 3)} CFT</p>
            <p className="text-sm text-ink-soft">{fmt(cftToCbm(hop), 3)} m³ Hoppus</p>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-ink-soft">True round volume</dt><dd className="num">{fmt(tru, 2)} CFT</dd></div>
              <div className="flex justify-between"><dt className="text-ink-soft">Value at {rupees(rate)}/CFT</dt><dd className="num font-bold">{rupees(hop * rate)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-soft">Expected sawn timber (≈70%)</dt><dd className="num">{fmt(hop * 0.7, 2)} CFT</dd></div>
            </dl>
            <p className="mt-3 text-xs text-ink-mute">Hoppus CFT = (quarter girth)² × length ÷ 144 — about 78.5% of the true volume.</p>
          </section>
        </div>
      )}
    </div>
  )
}
