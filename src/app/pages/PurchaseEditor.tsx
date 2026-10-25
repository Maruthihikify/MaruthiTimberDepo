import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { Boxes, Layers, PackageOpen, PackagePlus, Plus, Trash2, TreePine, Truck } from 'lucide-react'
import { rpc } from '../../lib/supabase'
import { invalidateBusiness } from '../../lib/queryClient'
import { fmt, rupees, rupees2, sectionLabel, size, todayIST } from '../../lib/format'
import { cmToIn, hoppusCft, mToFt, sawnCft, trueLogCft, STANDARD_SECTIONS } from '../../lib/timber'
import { endGrainUrl, toneFor } from '../../lib/wood'
import { useBalances, useProducts, useSettings, useSpecies } from '../data'
import { Combobox } from '../../components/Combobox'
import { Chip, Field, PageHeader, Segmented } from '../../components/ui'
import { RingSpinner } from '../../components/Loader'
import { toast } from '../../components/Toast'
import { PartyForm } from '../forms/PartyForm'

type Kind = 'log' | 'sawn' | 'panel' | 'unit'
interface L { key: number; kind: Kind; species_id?: string; log_no?: string; length_ft?: number; girth_in?: number; bark?: number; grade?: string; bay?: string
  t?: number; w?: number; pieces?: number; product_id?: string; qty?: number; rate?: number }
let seq = 1

export default function PurchaseEditor() {
  const nav = useNavigate()
  const balances = useBalances()
  const species = useSpecies()
  const products = useProducts()
  const settings = useSettings()
  const [supplier, setSupplier] = useState<string | null>(null)
  const [head, setHead] = useState({ bill_no: '', bill_date: todayIST(), permit_no: '', vehicle_no: '', lot_code: '', notes: '' })
  const [charges, setCharges] = useState({ freight: 0, unloading: 0, other: 0 })
  const [lines, setLines] = useState<L[]>([])
  const [metric, setMetric] = useState(false)
  const [pay, setPay] = useState({ amount: '' as number | '', mode: 'bank', reference: '' })
  const [busy, setBusy] = useState(false)
  const [newSup, setNewSup] = useState<{ open: boolean; name?: string }>({ open: false })

  const sup = (balances.data ?? []).find((b) => b.party_id === supplier)
  const supParty = sup
  const home = settings.data?.state_code ?? '29'
  const supState = sup?.gstin ? sup.gstin.slice(0, 2) : home
  const inter = supState !== home
  const S = useMemo(() => new Map((species.data ?? []).map((s) => [s.id, s])), [species.data])
  const P = useMemo(() => new Map((products.data ?? []).map((p) => [p.id, p])), [products.data])

  const calc = lines.map((l) => {
    let qty = 0, gst = 18, label = ''
    if (l.kind === 'log') { qty = hoppusCft(Number(l.girth_in) || 0, Number(l.length_ft) || 0, Number(l.bark) || 0); gst = Number(S.get(l.species_id ?? '')?.gst_rate ?? 18); label = 'CFT' }
    else if (l.kind === 'sawn') { qty = sawnCft(Number(l.t) || 0, Number(l.w) || 0, Number(l.length_ft) || 0, Number(l.pieces) || 0); gst = Number(S.get(l.species_id ?? '')?.gst_rate ?? 18); label = 'CFT' }
    else if (l.kind === 'panel') { const p = P.get(l.product_id ?? ''); qty = (Number(l.pieces) || 0) * Number(p?.sheet_sqft ?? 0); gst = Number(p?.gst_rate ?? 18); label = 'sq.ft' }
    else { const p = P.get(l.product_id ?? ''); qty = Number(l.qty) || 0; gst = Number(p?.gst_rate ?? 18); label = p?.uom ?? '' }
    const amount = Math.round(qty * (Number(l.rate) || 0) * 100) / 100
    return { qty, gst, amount, label, tax: Math.round(amount * gst) / 100 }
  })
  const sub = calc.reduce((a, c) => a + c.amount, 0)
  const tax = calc.reduce((a, c) => a + c.tax, 0)
  const ch = charges.freight + charges.unloading + charges.other
  const grand = sub + tax + ch
  const total = Math.round(grand)
  const logCft = calc.filter((_, i) => lines[i].kind === 'log').reduce((a, c) => a + c.qty, 0)

  const add = (kind: Kind) => {
    const last = [...lines].reverse().find((l) => l.kind === kind)
    const nextNo = kind === 'log' && last?.log_no ? last.log_no.replace(/(\d+)(?!.*\d)/, (m) => String(Number(m) + 1).padStart(m.length, '0')) : ''
    setLines((ls) => [...ls, { key: seq++, kind, species_id: last?.species_id, rate: last?.rate, log_no: nextNo, bark: last?.bark ?? Number(settings.data?.default_bark_allowance_in ?? 0), grade: last?.grade, bay: last?.bay, length_ft: kind === 'sawn' ? last?.length_ft : undefined, t: last?.t, w: last?.w }])
  }
  const upd = (key: number, p: Partial<L>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)))

  async function save() {
    if (!supplier) return toast.error('Choose the supplier')
    if (!lines.length) return toast.error('Add what came in')
    setBusy(true)
    try {
      const r = await rpc<{ id: string; ref_no: string; total: number }>('post_purchase', { p: {
        supplier_id: supplier, ...head, vehicle_no: head.vehicle_no || null, freight: charges.freight, unloading: charges.unloading, other_charges: charges.other,
        lines: lines.map((l) => l.kind === 'log' ? { line_kind: 'log', species_id: l.species_id, log_no: l.log_no, length_ft: l.length_ft, girth_in: l.girth_in, bark_allowance_in: l.bark ?? 0, rate: l.rate, grade: l.grade || null, bay: l.bay || null }
          : l.kind === 'sawn' ? { line_kind: 'sawn', species_id: l.species_id, grade: l.grade || null, thickness_in: l.t, width_in: l.w, length_ft: l.length_ft, pieces: l.pieces, rate: l.rate }
          : l.kind === 'panel' ? { line_kind: 'panel', product_id: l.product_id, pieces: l.pieces, rate: l.rate }
          : { line_kind: P.get(l.product_id ?? '')?.kind ?? 'unit', product_id: l.product_id, qty: l.qty, rate: l.rate }),
        payment: Number(pay.amount) > 0 ? { amount: Number(pay.amount), mode: pay.mode, reference: pay.reference || null } : null,
      } })
      invalidateBusiness()
      toast.success(`${r.ref_no} saved`, `${rupees(r.total)} · stock is in the yard`)
      nav(`/app/purchases/${r.id}`)
    } catch (e) { toast.error('Purchase not saved', (e as Error).message) } finally { setBusy(false) }
  }

  const spOpts = (species.data ?? []).filter((s) => s.active).map((s) => ({ value: s.id, label: s.name, hint: s.local_name ?? undefined }))

  return (
    <div>
      <PageHeader icon={<PackagePlus className="size-5" />} title="New purchase" subtitle={inter ? 'Inter-state supplier — IGST' : 'Measure each log as it is unloaded; freight and hamali go into the landed cost'} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <section className="card grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
            <Field label="Supplier *" className="sm:col-span-2">
              <Combobox value={supplier} onChange={setSupplier} placeholder="Choose supplier…"
                options={(balances.data ?? []).filter((b) => b.is_supplier && b.active).map((b) => ({ value: b.party_id, label: b.name, hint: [b.city, b.balance < 0 ? `we owe ${rupees(-b.balance)}` : null].filter(Boolean).join(' · ') }))}
                footer={(q, close) => <button className="btn-soft btn-sm w-full" onClick={() => { close(); setNewSup({ open: true, name: q }) }}><Plus className="size-3" /> New supplier</button>} />
            </Field>
            <Field label="Bill date"><input type="date" className="input" max={todayIST()} value={head.bill_date} onChange={(e) => setHead({ ...head, bill_date: e.target.value })} /></Field>
            <Field label="Supplier bill no."><input className="input" value={head.bill_no} onChange={(e) => setHead({ ...head, bill_no: e.target.value })} /></Field>
            <Field label="Forest permit / TP no." hint="Transit pass for timber movement"><input className="input" value={head.permit_no} onChange={(e) => setHead({ ...head, permit_no: e.target.value })} /></Field>
            <Field label="Vehicle no."><input className="input uppercase placeholder:normal-case" value={head.vehicle_no} onChange={(e) => setHead({ ...head, vehicle_no: e.target.value.toUpperCase() })} /></Field>
            {supParty && <div className="sm:col-span-3 flex flex-wrap gap-2 text-xs">{supParty.gstin ? <Chip tone="green">GSTIN {supParty.gstin}</Chip> : <Chip>Unregistered supplier</Chip>}{inter && <Chip tone="blue">IGST</Chip>}</div>}
          </section>

          <section className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
              <h3 className="font-display text-lg font-semibold">What came in</h3>
              <div className="flex flex-wrap items-center gap-1.5">
                <button className="btn-soft btn-sm" onClick={() => add('log')}><TreePine className="size-3.5" /> Log</button>
                <button className="btn-soft btn-sm" onClick={() => add('sawn')}><Layers className="size-3.5" /> Sawn</button>
                <button className="btn-soft btn-sm" onClick={() => add('panel')}><Boxes className="size-3.5" /> Plywood</button>
                <button className="btn-soft btn-sm" onClick={() => add('unit')}><PackageOpen className="size-3.5" /> Door / item</button>
              </div>
            </div>
            {lines.some((l) => l.kind === 'log') && (
              <div className="flex flex-wrap items-center gap-3 border-b border-line bg-cream/50 px-4 py-2 text-xs sm:px-5">
                <span className="font-semibold text-ink-soft">Log tape in</span>
                <Segmented size="sm" value={metric ? 'm' : 'ft'} onChange={(v) => setMetric(v === 'm')} items={[{ value: 'ft', label: 'feet & inches' }, { value: 'm', label: 'metres & cm' }]} />
                <span className="ml-auto font-bold">{lines.filter((l) => l.kind === 'log').length} logs · {fmt(logCft, 3)} CFT Hoppus</span>
              </div>
            )}
            {!lines.length ? <p className="px-5 py-8 text-center text-sm text-ink-soft">Add logs one by one as they are measured, or sawn sizes / plywood from the bill.</p> : (
              <div className="divide-y divide-line/70">
                <AnimatePresence initial={false}>
                  {lines.map((l, i) => (
                    <motion.div key={l.key} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="px-4 py-3 sm:px-5">
                      <div className="flex items-start gap-3">
                        {l.kind === 'log' ? (
                          <img src={endGrainUrl({ ...toneFor(S.get(l.species_id ?? '')?.name ?? 'teak', null, null, i), rings: 6 }, 72)} alt="" className="mt-6 size-10 shrink-0 rounded-full shadow" />
                        ) : <span className="mt-6 grid size-10 shrink-0 place-items-center rounded-xl bg-teak-50 text-teak-600">{l.kind === 'sawn' ? <Layers className="size-4.5" /> : l.kind === 'panel' ? <Boxes className="size-4.5" /> : <PackageOpen className="size-4.5" />}</span>}
                        <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-6">
                          {(l.kind === 'log' || l.kind === 'sawn') && (
                            <Field label="Species" className="col-span-2"><Combobox value={l.species_id ?? null} onChange={(v) => upd(l.key, { species_id: v })} options={spOpts} /></Field>
                          )}
                          {l.kind === 'log' && <>
                            <Field label="Log no."><input className="input input-sm" value={l.log_no ?? ''} onChange={(e) => upd(l.key, { log_no: e.target.value.toUpperCase() })} placeholder="GT-1201" /></Field>
                            <Field label={metric ? 'Length (m)' : 'Length (ft)'}><input className="input input-sm num" type="number" step="0.1" onChange={(e) => upd(l.key, { length_ft: metric ? Math.round(mToFt(Number(e.target.value)) * 100) / 100 : Number(e.target.value) })} defaultValue={l.length_ft} /></Field>
                            <Field label={metric ? 'Mid girth (cm)' : 'Mid girth (in)'}><input className="input input-sm num" type="number" step="0.5" onChange={(e) => upd(l.key, { girth_in: metric ? Math.round(cmToIn(Number(e.target.value)) * 100) / 100 : Number(e.target.value) })} defaultValue={l.girth_in} /></Field>
                            <Field label="Bark allow. (in)"><input className="input input-sm num" type="number" step="0.5" min={0} value={l.bark ?? 0} onChange={(e) => upd(l.key, { bark: Number(e.target.value) })} /></Field>
                          </>}
                          {l.kind === 'sawn' && <>
                            <Field label="Size">
                              <select className="input input-sm" value={l.t && l.w ? `${l.t}x${l.w}` : ''} onChange={(e) => { const [t, w] = e.target.value.split('x').map(Number); upd(l.key, { t, w }) }}>
                                <option value="">T × W…</option>
                                {STANDARD_SECTIONS.slice().reverse().map(([t, w]) => <option key={`${t}x${w}`} value={`${t}x${w}`}>{sectionLabel(t, w)}</option>)}
                              </select>
                            </Field>
                            <Field label="Length (ft)"><input className="input input-sm num" type="number" step="0.5" value={l.length_ft ?? ''} onChange={(e) => upd(l.key, { length_ft: Number(e.target.value) })} /></Field>
                            <Field label="Pieces"><input className="input input-sm num" type="number" min={1} value={l.pieces ?? ''} onChange={(e) => upd(l.key, { pieces: Math.round(Number(e.target.value)) })} /></Field>
                            <Field label="Grade"><input className="input input-sm" value={l.grade ?? ''} onChange={(e) => upd(l.key, { grade: e.target.value })} placeholder="A" /></Field>
                          </>}
                          {(l.kind === 'panel' || l.kind === 'unit') && (
                            <Field label={l.kind === 'panel' ? 'Plywood / board' : 'Item'} className="col-span-2 sm:col-span-3">
                              <Combobox value={l.product_id ?? null} onChange={(v) => upd(l.key, { product_id: v })} options={(products.data ?? []).filter((p) => (l.kind === 'panel' ? p.kind === 'panel' : p.kind === 'unit' || p.kind === 'byproduct')).map((p) => ({ value: p.id, label: p.name }))} />
                            </Field>
                          )}
                          {l.kind === 'panel' && <Field label="Sheets"><input className="input input-sm num" type="number" min={1} value={l.pieces ?? ''} onChange={(e) => upd(l.key, { pieces: Math.round(Number(e.target.value)) })} /></Field>}
                          {l.kind === 'unit' && <Field label="Qty"><input className="input input-sm num" type="number" min={0} value={l.qty ?? ''} onChange={(e) => upd(l.key, { qty: Number(e.target.value) })} /></Field>}
                          <Field label={l.kind === 'panel' ? 'Rate / sq.ft' : l.kind === 'unit' ? 'Rate' : 'Rate / CFT'}><input className="input input-sm num" type="number" min={0} value={l.rate ?? ''} onChange={(e) => upd(l.key, { rate: Number(e.target.value) })} /></Field>
                        </div>
                        <button className="mt-6 grid size-8 place-items-center rounded-lg text-ink-mute hover:bg-ember-50 hover:text-ember-600" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><Trash2 className="size-4" /></button>
                      </div>
                      <div className="ml-13 mt-1.5 flex flex-wrap gap-2 pl-[52px] text-xs">
                        {calc[i].qty > 0 && <Chip tone="brown">{fmt(calc[i].qty, 3)} {calc[i].label}</Chip>}
                        {l.kind === 'log' && calc[i].qty > 0 && <span className="text-ink-mute">true volume {fmt(trueLogCft((l.girth_in ?? 0) - (l.bark ?? 0), l.length_ft ?? 0), 2)} CFT · {size(l.length_ft)} ft × {size(l.girth_in)}″</span>}
                        {calc[i].amount > 0 && <span className="num ml-auto font-bold">{rupees2(calc[i].amount)}</span>}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </section>

          <section className="card grid gap-3 p-4 sm:grid-cols-4 sm:p-5">
            <h3 className="flex items-center gap-2 font-display text-lg font-semibold sm:col-span-4"><Truck className="size-4.5 text-teak-500" /> Freight & handling</h3>
            <Field label="Freight / lorry ₹"><input className="input num" type="number" min={0} value={charges.freight || ''} onChange={(e) => setCharges({ ...charges, freight: Number(e.target.value) || 0 })} /></Field>
            <Field label="Unloading / hamali ₹"><input className="input num" type="number" min={0} value={charges.unloading || ''} onChange={(e) => setCharges({ ...charges, unloading: Number(e.target.value) || 0 })} /></Field>
            <Field label="Other ₹"><input className="input num" type="number" min={0} value={charges.other || ''} onChange={(e) => setCharges({ ...charges, other: Number(e.target.value) || 0 })} /></Field>
            <Field label="Lot / auction code"><input className="input" value={head.lot_code} onChange={(e) => setHead({ ...head, lot_code: e.target.value })} /></Field>
            <p className="text-xs text-ink-mute sm:col-span-4">These are added to the cost of the timber in proportion to value, so every log and size carries its true landed cost per CFT. GST paid on the bill is input credit, not cost.</p>
          </section>
        </div>

        <aside className="xl:sticky xl:top-20 xl:self-start">
          <section className="card overflow-hidden">
            <div className="p-5" style={{ background: 'linear-gradient(135deg,#EEF8F1,#D5EEDC)' }}>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-leaf-700">Purchase total</p>
              <p className="num font-display text-4xl font-semibold text-leaf-700">{rupees(total)}</p>
            </div>
            <dl className="space-y-2 px-5 py-4 text-sm">
              <div className="flex justify-between"><dt className="text-ink-soft">Goods</dt><dd className="num">{rupees2(sub)}</dd></div>
              {inter ? <div className="flex justify-between"><dt className="text-ink-soft">IGST</dt><dd className="num">{rupees2(tax)}</dd></div> : <>
                <div className="flex justify-between"><dt className="text-ink-soft">CGST</dt><dd className="num">{rupees2(tax / 2)}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-soft">SGST</dt><dd className="num">{rupees2(tax / 2)}</dd></div></>}
              <div className="flex justify-between"><dt className="text-ink-soft">Freight & handling</dt><dd className="num">{rupees2(ch)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-soft">Round off</dt><dd className="num">{rupees2(total - grand)}</dd></div>
            </dl>
            <div className="border-t border-line px-5 py-4">
              <p className="mb-2 text-sm font-bold">Paid now</p>
              <div className="flex gap-2">
                <input className="input num" type="number" min={0} placeholder="0" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value === '' ? '' : Number(e.target.value) })} />
                <select className="input w-28" value={pay.mode} onChange={(e) => setPay({ ...pay, mode: e.target.value })}>{['bank', 'cash', 'upi', 'cheque'].map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}</select>
              </div>
              {Number(pay.amount) > 0 && pay.mode !== 'cash' && <input className="input mt-2" placeholder={pay.mode === 'cheque' ? 'Cheque no.' : 'UTR / reference'} value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} />}
            </div>
            <div className="border-t border-line bg-cream/40 p-4">
              <button className="btn-leaf w-full py-3" onClick={save} disabled={busy}>{busy ? <RingSpinner size={18} /> : <PackagePlus className="size-5" />} Save & add to stock</button>
            </div>
          </section>
        </aside>
      </div>
      <PartyForm open={newSup.open} kind="supplier" initialName={newSup.name} onClose={() => setNewSup({ open: false })} onSaved={(p) => setSupplier(p.id)} />
    </div>
  )
}
