import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import {
  Boxes, CircleDollarSign, FileText, Hammer, Layers, MessageCircle, PackageOpen, Plus, Printer, ReceiptIndianRupee,
  ShieldAlert, Trash2, TreePine, Truck, UserPlus, Users, Wrench,
} from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { must, rpc, supabase } from '../../lib/supabase'
import { invalidateBusiness } from '../../lib/queryClient'
import { billTotals, LINE_KINDS, sawnCft, UOM_LABEL, type LineKind } from '../../lib/timber'
import { fmt, GSTIN_RE, rupees, rupees2, sectionLabel, size, STATES, todayIST, whatsappLink } from '../../lib/format'
import { plankUrl, toneFor } from '../../lib/wood'
import { useBalances, useParties, useProducts, useSawnStock, useSettings, useSpecies, useYardLogs, productMap, speciesMap } from '../data'
import { Combobox, type Option } from '../../components/Combobox'
import { Field, Modal, PageHeader, Segmented, Chip } from '../../components/ui'
import { RingSpinner } from '../../components/Loader'
import { toast } from '../../components/Toast'
import { PartyForm } from '../forms/PartyForm'
import type { Party, SalesDoc } from '../types'

interface Draft {
  key: number
  kind: LineKind
  product_id?: string
  species_id?: string
  length_ft?: number
  pieces?: number
  log_id?: string
  qty?: number
  rate?: number
  discount_pct?: number
  description?: string
  note?: string
}

let keySeq = 1
const newLine = (kind: LineKind, extra: Partial<Draft> = {}): Draft => ({ key: keySeq++, kind, ...extra })

const KIND_ICON: Record<LineKind, typeof Layers> = { sawn: Layers, log: TreePine, panel: Boxes, unit: PackageOpen, service: Wrench, byproduct: Hammer }

export default function SaleEditor() {
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const { can, profile } = useAuth()
  const settings = useSettings()
  const species = useSpecies()
  const products = useProducts()
  const stock = useSawnStock()
  const yard = useYardLogs()
  const parties = useParties()
  const balances = useBalances()

  const fromQuote = sp.get('from')
  const enquiryId = sp.get('enquiry')
  const [docType, setDocType] = useState<'invoice' | 'quotation'>(sp.get('type') === 'quotation' ? 'quotation' : 'invoice')
  const [mode, setMode] = useState<'account' | 'walkin'>('walkin')
  const [customerId, setCustomerId] = useState<string | null>(sp.get('customer'))
  const [walkin, setWalkin] = useState({ name: '', phone: '', gstin: '', address: '' })
  const [lines, setLines] = useState<Draft[]>([newLine('sawn')])
  const [discount, setDiscount] = useState(0)
  const [carpenter, setCarpenter] = useState<string | null>(null)
  const [commission, setCommission] = useState<number | null>(null)
  const [delivery, setDelivery] = useState({ mode: 'pickup' as 'pickup' | 'delivery', address: '', vehicle: '', driver: '', phone: '' })
  const [pay, setPay] = useState<{ amount: number | ''; mode: string; reference: string }>({ amount: '', mode: 'cash', reference: '' })
  const [payTouched, setPayTouched] = useState(false)
  const [notes, setNotes] = useState('')
  const [docDate, setDocDate] = useState(todayIST())
  const [busy, setBusy] = useState(false)
  const [creditBlock, setCreditBlock] = useState<{ name: string; owe: number; limit: number } | null>(null)
  const [done, setDone] = useState<{ id: string; doc_no: string; total: number } | null>(null)
  const [newParty, setNewParty] = useState<{ open: boolean; name?: string }>({ open: false })

  useEffect(() => { if (customerId) setMode('account') }, [customerId])

  // convert a quotation / start from a website enquiry
  const source = useQuery({
    queryKey: ['doc', fromQuote],
    enabled: !!fromQuote,
    queryFn: async () => must(await supabase.from('sales_docs').select('*, sales_lines(*)').eq('id', fromQuote!).single()) as SalesDoc,
  })
  useEffect(() => {
    const q = source.data
    if (!q) return
    setDocType('invoice')
    if (q.customer_id) { setMode('account'); setCustomerId(q.customer_id) } else { setMode('walkin'); setWalkin({ name: q.customer_name, phone: q.customer_phone ?? '', gstin: q.customer_gstin ?? '', address: q.billing_address ?? '' }) }
    setLines((q.sales_lines ?? []).sort((a, b) => a.line_no - b.line_no).map((l) => newLine(l.line_kind, {
      product_id: l.product_id ?? undefined, log_id: l.log_id ?? undefined, length_ft: l.length_ft ?? undefined,
      pieces: l.pieces ?? undefined, qty: l.qty, rate: l.rate, discount_pct: l.discount_pct,
      description: l.line_kind === 'service' && !l.product_id ? l.description : undefined,
    })))
    setDiscount(Number(q.discount) || 0)
    setNotes(q.notes ?? '')
  }, [source.data])
  const enquiry = useQuery({
    queryKey: ['enquiry', enquiryId],
    enabled: !!enquiryId,
    queryFn: async () => must(await supabase.from('enquiries').select('*').eq('id', enquiryId!).single()) as { name: string; phone: string; requirement: string },
  })
  useEffect(() => {
    const e = enquiry.data
    if (!e) return
    setDocType('quotation')
    setMode('walkin')
    setWalkin((w) => ({ ...w, name: e.name, phone: e.phone }))
    setNotes(`Website enquiry: ${e.requirement}`)
  }, [enquiry.data])

  const S = useMemo(() => speciesMap(species.data), [species.data])
  const P = useMemo(() => productMap(products.data), [products.data])
  const co = settings.data
  const cust: Party | undefined = useMemo(() => (parties.data ?? []).find((p) => p.id === customerId), [parties.data, customerId])
  const custBal = useMemo(() => (balances.data ?? []).find((b) => b.party_id === customerId), [balances.data, customerId])

  // stock lookups
  const stockByProduct = useMemo(() => {
    const m = new Map<string, Map<number, number>>()
    for (const r of stock.data ?? []) {
      if (!m.has(r.product_id)) m.set(r.product_id, new Map())
      m.get(r.product_id)!.set(Number(r.length_ft), r.pieces)
    }
    return m
  }, [stock.data])
  const logsById = useMemo(() => new Map((yard.data ?? []).map((l) => [l.id, l])), [yard.data])

  // place of supply
  const gstin = mode === 'account' ? cust?.gstin ?? '' : walkin.gstin.trim().toUpperCase()
  const pos = gstin && GSTIN_RE.test(gstin) ? gstin.slice(0, 2) : mode === 'account' ? cust?.state_code ?? co?.state_code ?? '29' : co?.state_code ?? '29'
  const interstate = !!co && pos !== co.state_code

  // compute each line exactly like post_sale()
  const computed = useMemo(() => lines.map((l) => {
    let qty = 0, uom = 'cft', gst = 18, list = 0, label = '', ok = false, warn = ''
    if (l.kind === 'sawn' && l.product_id) {
      const p = P.get(l.product_id)
      if (p) {
        qty = sawnCft(Number(p.thickness_in), Number(p.width_in), Number(l.length_ft) || 0, Number(l.pieces) || 0)
        gst = Number(p.gst_rate); list = Number(p.sale_rate)
        label = `${p.name} × ${size(l.length_ft)} ft`
        ok = qty > 0
        const have = stockByProduct.get(p.id)?.get(Number(l.length_ft)) ?? 0
        if (docType === 'invoice' && ok && (Number(l.pieces) || 0) > have) warn = `Only ${have} pcs of ${size(l.length_ft)} ft in stock`
      }
    } else if (l.kind === 'log' && l.log_id) {
      const g = logsById.get(l.log_id)
      if (g) {
        qty = Number(g.cft); gst = Number(S.get(g.species_id)?.gst_rate ?? 18)
        list = Number(g.sale_rate_cft ?? S.get(g.species_id)?.log_rate_cft ?? 0)
        label = `${g.species?.name} log #${g.log_no}`; ok = true
      }
    } else if (l.kind === 'panel' && l.product_id) {
      const p = P.get(l.product_id)
      if (p) {
        qty = Math.round((Number(l.pieces) || 0) * Number(p.sheet_sqft) * 1000) / 1000; uom = 'sqft'
        gst = Number(p.gst_rate); list = Number(p.sale_rate); label = p.name; ok = qty > 0
        if (docType === 'invoice' && (Number(l.pieces) || 0) > Number(p.qty_on_hand)) warn = `Only ${fmt(p.qty_on_hand, 0)} sheets in stock`
      }
    } else if ((l.kind === 'unit' || l.kind === 'byproduct') && l.product_id) {
      const p = P.get(l.product_id)
      if (p) {
        qty = Number(l.qty) || 0; uom = p.uom; gst = Number(p.gst_rate); list = Number(p.sale_rate); label = p.name; ok = qty > 0
        if (docType === 'invoice' && qty > Number(p.qty_on_hand)) warn = `Only ${fmt(p.qty_on_hand, 2)} ${UOM_LABEL[p.uom] ?? p.uom} in stock`
      }
    } else if (l.kind === 'service') {
      const p = l.product_id ? P.get(l.product_id) : undefined
      qty = Number(l.qty ?? 1) || 0; uom = p?.uom ?? 'job'; gst = Number(p?.gst_rate ?? 18); list = Number(p?.sale_rate ?? 0)
      label = l.description || p?.name || ''; ok = qty > 0 && !!label
    }
    const rate = l.rate ?? list
    const maxDisc = Number(co?.max_sales_discount_pct ?? 10)
    if (profile?.role === 'sales' && list > 0 && rate * (1 - (l.discount_pct ?? 0) / 100) < list * (1 - maxDisc / 100) - 0.005) warn = `More than ${maxDisc}% below list ₹${fmt(list)} — manager must bill`
    return { qty, uom, gst, list, rate, label, ok, warn }
  }), [lines, P, S, logsById, stockByProduct, docType, co, profile?.role])

  const valid = computed.filter((c) => c.ok)
  const totals = useMemo(() => billTotals(valid.map((c, i) => ({ qty: c.qty, rate: c.rate, discountPct: lines[computed.indexOf(c)]?.discount_pct ?? 0, gstRate: c.gst || 0, _i: i })), discount, interstate), [valid, computed, lines, discount, interstate])

  // default the payment box to the full amount for walk-ins
  useEffect(() => {
    if (!payTouched) setPay((p) => ({ ...p, amount: docType === 'invoice' && mode === 'walkin' ? totals.total : '' }))
  }, [totals.total, mode, docType, payTouched])

  const update = (key: number, patch: Partial<Draft>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const remove = (key: number) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : [newLine('sawn')]))

  const carpenters = useMemo(() => (parties.data ?? []).filter((p) => p.is_carpenter && p.active), [parties.data])
  const carpenterParty = carpenters.find((c) => c.id === carpenter)

  const customerOptions: Option[] = useMemo(() => (balances.data ?? []).filter((b) => b.is_customer && b.active).map((b) => ({
    value: b.party_id, label: b.name, keywords: `${b.phone ?? ''} ${b.city ?? ''}`,
    hint: [b.city, b.phone, b.gstin ? 'GST' : null].filter(Boolean).join(' · '),
    right: b.balance > 0 ? <Chip tone={b.overdue > 0 ? 'red' : 'amber'}>Due {rupees(b.balance)}</Chip> : undefined,
  })), [balances.data])

  const payload = useCallback((override = false) => ({
    doc_type: docType,
    doc_date: docDate,
    ...(mode === 'account' ? { customer_id: customerId } : { customer_name: walkin.name.trim(), customer_phone: walkin.phone.trim() || null, customer_gstin: walkin.gstin.trim().toUpperCase() || null, billing_address: walkin.address.trim() || null }),
    discount,
    referred_by: docType === 'invoice' ? carpenter : null,
    commission_pct: commission,
    notes: notes.trim() || null,
    source_doc_id: fromQuote,
    enquiry_id: enquiryId,
    delivery_mode: delivery.mode,
    delivery_address: delivery.mode === 'delivery' ? delivery.address || (mode === 'account' ? cust?.address : walkin.address) : null,
    vehicle_no: delivery.vehicle || null, driver_name: delivery.driver || null, driver_phone: delivery.phone || null,
    override_credit: override,
    lines: lines.filter((_, i) => computed[i].ok).map((l) => ({
      line_kind: l.kind, product_id: l.product_id ?? null, log_id: l.log_id ?? null, length_ft: l.length_ft ?? null,
      pieces: l.pieces ?? null, qty: l.kind === 'unit' || l.kind === 'byproduct' || l.kind === 'service' ? l.qty ?? 1 : null,
      rate: l.rate ?? computed[lines.indexOf(l)].list, discount_pct: l.discount_pct ?? 0,
      description: l.kind === 'service' ? l.description ?? null : null, note: l.note ?? null,
    })),
    payment: docType === 'invoice' && Number(pay.amount) > 0 ? { amount: Number(pay.amount), mode: pay.mode, reference: pay.reference || null } : null,
  }), [docType, docDate, mode, customerId, walkin, discount, carpenter, commission, notes, fromQuote, enquiryId, delivery, cust, lines, computed, pay])

  async function save(override = false) {
    if (mode === 'account' && !customerId) return toast.error('Choose the customer', 'Or switch to walk-in')
    if (mode === 'walkin' && !walkin.name.trim()) return toast.error('Enter the customer name')
    if (mode === 'walkin' && walkin.gstin && !GSTIN_RE.test(walkin.gstin.trim().toUpperCase())) return toast.error('GSTIN looks wrong')
    if (!valid.length) return toast.error('Add at least one complete item')
    const blocking = computed.find((c) => c.ok && c.warn && docType === 'invoice')
    if (blocking) return toast.error('Check the items', blocking.warn)
    setBusy(true)
    try {
      const r = await rpc<{ id: string; doc_no: string; total: number }>('post_sale', { p: payload(override) })
      invalidateBusiness()
      setCreditBlock(null)
      setDone(r)
    } catch (e) {
      const m = (e as Error).message
      if (m.startsWith('CREDIT_LIMIT|')) {
        const [, name, owe, limit] = m.split('|')
        setCreditBlock({ name, owe: Number(owe), limit: Number(limit) })
      } else toast.error('Bill not saved', m)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void save() } }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })

  const resetAll = () => {
    setDone(null); setLines([newLine('sawn')]); setDiscount(0); setCarpenter(null); setCommission(null); setNotes(''); setPayTouched(false)
    setWalkin({ name: '', phone: '', gstin: '', address: '' }); setCustomerId(null); setMode('walkin'); setDelivery({ mode: 'pickup', address: '', vehicle: '', driver: '', phone: '' })
    nav('/app/sales/new', { replace: true })
  }

  const loading = species.isLoading || products.isLoading
  return (
    <div>
      <PageHeader
        icon={<ReceiptIndianRupee className="size-5" />}
        title={fromQuote ? `Convert quotation ${source.data?.doc_no ?? ''}` : docType === 'invoice' ? 'New GST bill' : 'New quotation'}
        subtitle={interstate ? <span className="font-semibold text-sky-600">Inter-state sale to {STATES[pos]} — IGST applies</span> : `Within ${co?.state_name ?? 'Karnataka'} — CGST + SGST`}
        actions={!fromQuote && <Segmented value={docType} onChange={setDocType} items={[{ value: 'invoice', label: 'Tax invoice', icon: <ReceiptIndianRupee className="size-4" /> }, { value: 'quotation', label: 'Quotation', icon: <FileText className="size-4" /> }]} />}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          {/* customer */}
          <section className="card p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-lg font-semibold">Customer</h3>
              <Segmented size="sm" value={mode} onChange={(v) => { setMode(v); if (v === 'walkin') setCustomerId(null) }} items={[{ value: 'walkin', label: 'Walk-in / cash' }, { value: 'account', label: 'Account customer', icon: <Users className="size-3.5" /> }]} />
            </div>
            {mode === 'account' ? (
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <Combobox value={customerId} onChange={setCustomerId} options={customerOptions} placeholder="Search customer by name, phone or town…"
                  footer={(q, close) => <button className="btn-soft btn-sm w-full" onClick={() => { close(); setNewParty({ open: true, name: q }) }}><UserPlus className="size-3.5" /> Add “{q || 'new customer'}”</button>} />
                <input type="date" className="input sm:w-44" value={docDate} max={todayIST()} onChange={(e) => setDocDate(e.target.value)} />
                {cust && (
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center gap-2 text-xs sm:col-span-2">
                    {cust.gstin ? <Chip tone="green">GSTIN {cust.gstin}</Chip> : <Chip>No GSTIN · B2C</Chip>}
                    <Chip tone="brown">{cust.credit_limit > 0 ? `Credit ${rupees(cust.credit_limit)} · ${cust.credit_days} days` : 'Cash only'}</Chip>
                    {custBal && custBal.balance > 0 && <Chip tone={custBal.overdue > 0 ? 'red' : 'amber'}>Owes {rupees(custBal.balance)}{custBal.overdue > 0 ? ` · ${rupees(custBal.overdue)} overdue` : ''}</Chip>}
                    {custBal && custBal.balance < 0 && <Chip tone="green">Advance {rupees(-custBal.balance)}</Chip>}
                    {cust.city && <span className="text-ink-soft">{cust.city}</span>}
                  </motion.div>
                )}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <input className="input" placeholder="Customer name *" value={walkin.name} onChange={(e) => setWalkin({ ...walkin, name: e.target.value })} />
                <input className="input" placeholder="Mobile" inputMode="tel" value={walkin.phone} onChange={(e) => setWalkin({ ...walkin, phone: e.target.value })} />
                <input className="input uppercase placeholder:normal-case" placeholder="GSTIN (optional)" maxLength={15} value={walkin.gstin} onChange={(e) => setWalkin({ ...walkin, gstin: e.target.value.toUpperCase() })} />
                <input type="date" className="input" value={docDate} max={todayIST()} onChange={(e) => setDocDate(e.target.value)} />
                <input className="input sm:col-span-2 lg:col-span-4" placeholder="Address (optional)" value={walkin.address} onChange={(e) => setWalkin({ ...walkin, address: e.target.value })} />
              </div>
            )}
          </section>

          {/* items */}
          <section className="card overflow-visible">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
              <h3 className="font-display text-lg font-semibold">Items</h3>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(LINE_KINDS) as LineKind[]).map((k) => {
                  const I = KIND_ICON[k]
                  return <button key={k} className="btn-soft btn-sm" onClick={() => setLines((ls) => [...ls, newLine(k, k === 'service' ? { qty: 1 } : k === 'unit' || k === 'byproduct' ? { qty: 1 } : {})])}><Plus className="size-3" /><I className="size-3.5" /> {LINE_KINDS[k].split(' /')[0]}</button>
                })}
              </div>
            </div>
            {loading ? <div className="space-y-3 p-5">{[0, 1].map((i) => <div key={i} className="skeleton h-28" />)}</div> : (
              <div className="divide-y divide-line/70">
                <AnimatePresence initial={false}>
                  {lines.map((l, i) => (
                    <motion.div key={l.key} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25 }} className="overflow-visible">
                      <LineEditor index={i + 1} line={l} calc={computed[i]} lineTotal={totals.lines[valid.indexOf(computed[i])]?.amount}
                        onChange={(patch) => update(l.key, patch)} onRemove={() => remove(l.key)}
                        speciesList={species.data ?? []} products={products.data ?? []} stock={stockByProduct} yardLogs={yard.data ?? []} invoice={docType === 'invoice'} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </section>

          {/* delivery & referral */}
          <section className="card grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
            <div>
              <h3 className="mb-2 flex items-center gap-2 font-display text-lg font-semibold"><Truck className="size-4.5 text-teak-500" /> Delivery</h3>
              <Segmented size="sm" value={delivery.mode} onChange={(v) => setDelivery({ ...delivery, mode: v })} items={[{ value: 'pickup', label: 'Customer picks up' }, { value: 'delivery', label: 'We deliver' }]} />
              <AnimatePresence>
                {delivery.mode === 'delivery' && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-3 grid gap-2 overflow-hidden sm:grid-cols-2">
                    <input className="input sm:col-span-2" placeholder="Site address" value={delivery.address} onChange={(e) => setDelivery({ ...delivery, address: e.target.value })} />
                    <input className="input uppercase placeholder:normal-case" placeholder="Vehicle no." value={delivery.vehicle} onChange={(e) => setDelivery({ ...delivery, vehicle: e.target.value })} />
                    <input className="input" placeholder="Driver" value={delivery.driver} onChange={(e) => setDelivery({ ...delivery, driver: e.target.value })} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {docType === 'invoice' && (
              <div>
                <h3 className="mb-2 flex items-center gap-2 font-display text-lg font-semibold"><Hammer className="size-4.5 text-teak-500" /> Referred by carpenter</h3>
                <Combobox value={carpenter} onChange={(v) => { setCarpenter(v); setCommission(null) }} placeholder="None"
                  options={[{ value: '', label: 'No referral' }, ...carpenters.map((c) => ({ value: c.id, label: c.name, hint: `${c.commission_pct}% commission · ${c.city ?? ''}` }))]} />
                {carpenterParty && (
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <span className="text-ink-soft">Commission</span>
                    <input type="number" className="input input-sm num w-20" min={0} max={20} step={0.5} value={commission ?? carpenterParty.commission_pct} onChange={(e) => setCommission(Number(e.target.value))} />
                    <span className="text-ink-soft">% = <b className="num text-ink">{rupees2(totals.taxable * (commission ?? carpenterParty.commission_pct) / 100)}</b></span>
                  </div>
                )}
              </div>
            )}
            <Field label="Notes on the bill" className="sm:col-span-2"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Site: Whitefield · Measured in front of customer" /></Field>
          </section>
        </div>

        {/* totals rail */}
        <aside className="xl:sticky xl:top-20 xl:self-start">
          <section className="card overflow-hidden">
            <div className="relative overflow-hidden px-5 pb-5 pt-4" style={{ background: 'linear-gradient(135deg,#FFF6E8,#F6DDB8)' }}>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-teak-700">{docType === 'invoice' ? 'Bill total' : 'Quotation total'}</p>
              <motion.p key={totals.total} initial={{ scale: 0.96, opacity: 0.6 }} animate={{ scale: 1, opacity: 1 }} className="num font-display text-[40px] font-semibold leading-tight text-teak-900">{rupees(totals.total)}</motion.p>
              <p className="text-xs font-semibold text-teak-700">{valid.length} item{valid.length === 1 ? '' : 's'} · {fmt(valid.filter((c) => c.uom === 'cft').reduce((a, c) => a + c.qty, 0), 3)} CFT</p>
            </div>
            <dl className="space-y-2 px-5 py-4 text-sm">
              <Row label="Items value" value={rupees2(totals.subtotal)} />
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-soft">Discount</dt>
                <dd><input type="number" min={0} className="input input-sm num w-28 text-right" value={discount || ''} placeholder="0" onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))} /></dd>
              </div>
              <Row label="Taxable value" value={rupees2(totals.taxable)} strong />
              {interstate ? <Row label="IGST" value={rupees2(totals.igst)} /> : <><Row label="CGST" value={rupees2(totals.cgst)} /><Row label="SGST" value={rupees2(totals.sgst)} /></>}
              <Row label="Round off" value={rupees2(totals.roundOff)} />
            </dl>
            {docType === 'invoice' && (
              <div className="border-t border-line px-5 py-4">
                <p className="mb-2 flex items-center gap-2 text-sm font-bold"><CircleDollarSign className="size-4 text-leaf-500" /> Payment now</p>
                <div className="flex gap-2">
                  <input type="number" min={0} className="input num" value={pay.amount} placeholder="0" onChange={(e) => { setPayTouched(true); setPay({ ...pay, amount: e.target.value === '' ? '' : Number(e.target.value) }) }} />
                  <select className="input w-28" value={pay.mode} onChange={(e) => setPay({ ...pay, mode: e.target.value })}>
                    {['cash', 'upi', 'card', 'bank', 'cheque'].map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}
                  </select>
                </div>
                {pay.mode !== 'cash' && Number(pay.amount) > 0 && <input className="input mt-2" placeholder={pay.mode === 'cheque' ? 'Cheque number *' : 'UTR / reference'} value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} />}
                <div className="mt-2 flex gap-1.5">
                  <button className="btn-soft btn-sm" onClick={() => { setPayTouched(true); setPay({ ...pay, amount: totals.total }) }}>Full</button>
                  <button className="btn-soft btn-sm" onClick={() => { setPayTouched(true); setPay({ ...pay, amount: '' }) }}>On credit</button>
                </div>
                {totals.total - Number(pay.amount || 0) > 0 && (
                  <p className={`mt-2 text-xs font-semibold ${mode === 'walkin' ? 'text-ember-600' : 'text-sun-500'}`}>
                    {mode === 'walkin' ? 'Walk-in bills must be paid in full — choose an account customer for credit.' : `${rupees(totals.total - Number(pay.amount || 0))} will be added to ${cust?.name ?? 'the account'}`}
                  </p>
                )}
              </div>
            )}
            <div className="border-t border-line bg-cream/40 p-4">
              <button className="btn-primary w-full py-3 text-base" onClick={() => save()} disabled={busy}>
                {busy ? <RingSpinner size={20} /> : docType === 'invoice' ? <ReceiptIndianRupee className="size-5" /> : <FileText className="size-5" />}
                {docType === 'invoice' ? 'Save bill' : 'Save quotation'}
              </button>
              <p className="mt-2 text-center text-[11px] text-ink-mute">Ctrl + Enter to save · stock is deducted only for tax invoices</p>
            </div>
          </section>
        </aside>
      </div>

      <PartyForm open={newParty.open} initialName={newParty.name} onClose={() => setNewParty({ open: false })} onSaved={(p) => { setMode('account'); setCustomerId(p.id) }} />

      <Modal open={!!creditBlock} onClose={() => setCreditBlock(null)} title="Credit limit reached"
        footer={<>
          <button className="btn-ghost" onClick={() => setCreditBlock(null)}>Back to bill</button>
          {can('manager') && <button className="btn bg-ember-500 text-white hover:bg-ember-600" disabled={busy} onClick={() => save(true)}>{busy && <RingSpinner size={16} />} Allow this once</button>}
        </>}>
        {creditBlock && (
          <div className="flex gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-ember-50 text-ember-600"><ShieldAlert className="size-6" /></span>
            <div className="text-sm text-ink-soft">
              <p><b className="text-ink">{creditBlock.name}</b> would owe <b className="text-ember-600">{rupees(creditBlock.owe)}</b> after this bill, above the credit limit of <b className="text-ink">{rupees(creditBlock.limit)}</b>.</p>
              <p className="mt-2">{can('manager') ? 'You can allow it once (recorded in the audit trail), or take more payment now.' : 'Take more payment now, or ask the owner/manager to approve.'}</p>
            </div>
          </div>
        )}
      </Modal>

      <SuccessOverlay done={done} docType={docType} phone={mode === 'account' ? cust?.phone : walkin.phone} company={co?.name ?? 'Maruthi Timber Depot'} onNew={resetAll} />
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className="flex items-center justify-between gap-3"><dt className="text-ink-soft">{label}</dt><dd className={`num ${strong ? 'font-bold text-ink' : 'font-semibold'}`}>{value}</dd></div>
}

function SuccessOverlay({ done, docType, phone, company, onNew }: { done: { id: string; doc_no: string; total: number } | null; docType: string; phone?: string | null; company: string; onNew: () => void }) {
  const nav = useNavigate()
  return (
    <AnimatePresence>
      {done && (
        <div className="fixed inset-0 z-[85] grid place-items-center p-4">
          <motion.div className="absolute inset-0 bg-teak-900/40 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.div initial={{ opacity: 0, y: 30, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-line bg-paper p-7 text-center shadow-lift">
            {/* sawdust burst */}
            {Array.from({ length: 22 }, (_, i) => (
              <motion.span key={i} className="absolute left-1/2 top-24 size-1.5 rounded-full" style={{ background: ['#E8AD62', '#C9762A', '#F2CC97', '#45A86D'][i % 4] }}
                initial={{ x: 0, y: 0, opacity: 1 }} animate={{ x: Math.cos(i * 0.6) * (90 + (i % 5) * 18), y: Math.sin(i * 0.6) * (70 + (i % 4) * 16) + 40, opacity: 0 }} transition={{ duration: 1.2, ease: 'easeOut' }} />
            ))}
            <div className="relative mx-auto mb-4 w-fit">
              <div className="animate-stamp rounded-xl border-4 border-leaf-500 px-5 py-2 font-display text-2xl font-bold uppercase tracking-[0.2em] text-leaf-600" style={{ transform: 'rotate(-10deg)' }}>
                {docType === 'invoice' ? 'Billed' : 'Quoted'}
              </div>
            </div>
            <p className="font-display text-2xl font-semibold">{done.doc_no}</p>
            <p className="num mt-1 text-3xl font-bold text-teak-700">{rupees(done.total)}</p>
            <div className="mt-6 grid grid-cols-2 gap-2">
              <button className="btn-primary" onClick={() => nav(`/app/sales/${done.id}?print=1`)}><Printer className="size-4" /> Print</button>
              <a className="btn-leaf" target="_blank" rel="noreferrer" href={whatsappLink(phone, `${company}\n${docType === 'invoice' ? 'Bill' : 'Quotation'} ${done.doc_no}\nAmount: ${rupees(done.total)}\nThank you for your business.`)}><MessageCircle className="size-4" /> WhatsApp</a>
              <Link className="btn-ghost" to={`/app/sales/${done.id}`}>Open</Link>
              <button className="btn-ghost" onClick={onNew}><Plus className="size-4" /> New bill</button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

// ───────────────────────── one line ─────────────────────────
import type { Log, Product, Species } from '../types'

function LineEditor({ index, line, calc, lineTotal, onChange, onRemove, speciesList, products, stock, yardLogs, invoice }: {
  index: number; line: Draft; calc: { qty: number; uom: string; gst: number; list: number; rate: number; label: string; ok: boolean; warn: string }; lineTotal?: number
  onChange: (p: Partial<Draft>) => void; onRemove: () => void; speciesList: Species[]; products: Product[]; stock: Map<string, Map<number, number>>; yardLogs: Log[]; invoice: boolean
}) {
  const Icon = KIND_ICON[line.kind]
  const sections = useMemo(() => products.filter((p) => p.kind === 'sawn' && p.active && p.species_id === line.species_id)
    .sort((a, b) => Number(b.thickness_in) * Number(b.width_in) - Number(a.thickness_in) * Number(a.width_in)), [products, line.species_id])
  const lengths = line.product_id ? [...(stock.get(line.product_id)?.entries() ?? [])].sort((a, b) => a[0] - b[0]) : []
  const speciesWithStock = useMemo(() => {
    const ids = new Set(products.filter((p) => p.kind === 'sawn' && stock.has(p.id)).map((p) => p.species_id))
    return speciesList.filter((s) => s.active).sort((a, b) => Number(ids.has(b.id)) - Number(ids.has(a.id)))
  }, [speciesList, products, stock])

  return (
    <div className="p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-lg bg-teak-50 text-xs font-bold text-teak-700">{index}</span>
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-soft"><Icon className="size-3.5" /> {LINE_KINDS[line.kind]}</span>
        <span className="ml-auto num text-sm font-bold text-ink">{lineTotal !== undefined ? rupees2(lineTotal) : ''}</span>
        <button className="grid size-8 place-items-center rounded-lg text-ink-mute hover:bg-ember-50 hover:text-ember-600" onClick={onRemove} aria-label="Remove line"><Trash2 className="size-4" /></button>
      </div>

      {line.kind === 'sawn' && (
        <div className="space-y-3">
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {speciesWithStock.map((s) => (
              <button key={s.id} type="button" onClick={() => onChange({ species_id: s.id, product_id: undefined, length_ft: undefined, rate: undefined })}
                className={`group flex shrink-0 items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs font-bold transition-all ${line.species_id === s.id ? 'border-teak-400 bg-teak-50 text-teak-800 shadow-card' : 'border-line bg-paper text-ink-soft hover:border-teak-300'}`}>
                <span className="h-4 w-7 rounded bg-cover shadow-inner ring-1 ring-black/10" style={{ backgroundImage: `url(${plankUrl(toneFor(s.name, s.color_hex, s.grain_hex, 2), 112, 24)})` }} />
                {s.name}
              </button>
            ))}
          </div>
          {line.species_id && (
            <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr_0.8fr_1fr_0.7fr]">
              <Field label="Size (thickness × width)">
                <select className="input" value={line.product_id ?? ''} onChange={(e) => onChange({ product_id: e.target.value || undefined, length_ft: undefined, rate: undefined })}>
                  <option value="">Choose size…</option>
                  {sections.map((p) => {
                    const pcs = [...(stock.get(p.id)?.values() ?? [])].reduce((a, b) => a + b, 0)
                    return <option key={p.id} value={p.id}>{sectionLabel(p.thickness_in, p.width_in)}{p.grade ? ` (${p.grade})` : ''} — {pcs ? `${pcs} pcs` : 'no stock'}</option>
                  })}
                </select>
              </Field>
              <Field label="Length (ft)">
                <input className="input num" type="number" step={0.5} min={1} list={`len-${line.key}`} value={line.length_ft ?? ''} onChange={(e) => onChange({ length_ft: e.target.value ? Number(e.target.value) : undefined })} />
                <datalist id={`len-${line.key}`}>{lengths.map(([l]) => <option key={l} value={l} />)}</datalist>
              </Field>
              <Field label="Pieces"><input className="input num" type="number" min={1} step={1} value={line.pieces ?? ''} onChange={(e) => onChange({ pieces: e.target.value ? Math.max(0, Math.round(Number(e.target.value))) : undefined })} /></Field>
              <Field label="Rate / CFT"><input className="input num" type="number" min={0} value={line.rate ?? (calc.list || '')} onChange={(e) => onChange({ rate: e.target.value === '' ? undefined : Number(e.target.value) })} /></Field>
              <Field label="Disc %"><input className="input num" type="number" min={0} max={100} value={line.discount_pct ?? ''} onChange={(e) => onChange({ discount_pct: Number(e.target.value) || 0 })} /></Field>
            </div>
          )}
          {line.product_id && lengths.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {lengths.map(([l, pcs]) => (
                <button key={l} type="button" onClick={() => onChange({ length_ft: l })}
                  className={`num rounded-lg border px-2 py-1 text-[11px] font-bold transition ${Number(line.length_ft) === l ? 'border-leaf-400 bg-leaf-50 text-leaf-700' : 'border-line bg-paper text-ink-soft hover:border-teak-300'}`}>
                  {size(l)} ft · {pcs} pcs
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {line.kind === 'log' && (
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <Field label="Log from the yard">
            <Combobox value={line.log_id ?? null} onChange={(v) => onChange({ log_id: v, rate: undefined })} placeholder="Search log number or species…"
              options={yardLogs.map((g) => ({ value: g.id, label: `#${g.log_no} · ${g.species?.name}`, keywords: g.species?.name, hint: `${size(g.length_ft)} ft × ${size(g.girth_in)}″ girth · ${fmt(g.cft, 3)} CFT Hoppus${g.bay ? ` · ${g.bay}` : ''}` }))} />
          </Field>
          <Field label="Rate / CFT (Hoppus)"><input className="input num" type="number" min={0} value={line.rate ?? (calc.list || '')} onChange={(e) => onChange({ rate: e.target.value === '' ? undefined : Number(e.target.value) })} /></Field>
        </div>
      )}

      {(line.kind === 'panel' || line.kind === 'unit' || line.kind === 'byproduct') && (
        <div className="grid gap-3 sm:grid-cols-[2fr_0.8fr_1fr_0.7fr]">
          <Field label={line.kind === 'panel' ? 'Plywood / board' : 'Item'}>
            <Combobox value={line.product_id ?? null} onChange={(v) => onChange({ product_id: v, rate: undefined })}
              options={products.filter((p) => p.kind === line.kind && p.active).map((p) => ({ value: p.id, label: p.name, hint: `${fmt(p.qty_on_hand, 2)} ${p.kind === 'panel' ? 'sheets' : UOM_LABEL[p.uom] ?? p.uom} in stock · ₹${fmt(p.sale_rate)}/${UOM_LABEL[p.uom] ?? p.uom}` }))} />
          </Field>
          {line.kind === 'panel'
            ? <Field label="Sheets"><input className="input num" type="number" min={1} value={line.pieces ?? ''} onChange={(e) => onChange({ pieces: e.target.value ? Math.max(0, Math.round(Number(e.target.value))) : undefined })} /></Field>
            : <Field label="Qty"><input className="input num" type="number" min={0} step="any" value={line.qty ?? ''} onChange={(e) => onChange({ qty: e.target.value ? Number(e.target.value) : undefined })} /></Field>}
          <Field label={line.kind === 'panel' ? 'Rate / sq.ft' : 'Rate'}><input className="input num" type="number" min={0} value={line.rate ?? (calc.list || '')} onChange={(e) => onChange({ rate: e.target.value === '' ? undefined : Number(e.target.value) })} /></Field>
          <Field label="Disc %"><input className="input num" type="number" min={0} max={100} value={line.discount_pct ?? ''} onChange={(e) => onChange({ discount_pct: Number(e.target.value) || 0 })} /></Field>
        </div>
      )}

      {line.kind === 'service' && (
        <div className="grid gap-3 sm:grid-cols-[2fr_0.8fr_1fr]">
          <Field label="Service / charge">
            <Combobox value={line.product_id ?? null} onChange={(v) => onChange({ product_id: v, rate: undefined, description: undefined })}
              options={products.filter((p) => p.kind === 'service' && p.active).map((p) => ({ value: p.id, label: p.name, hint: `₹${fmt(p.sale_rate)} / ${UOM_LABEL[p.uom] ?? p.uom}` }))}
              footer={() => <input className="input input-sm" placeholder="…or type any other charge" value={line.description ?? ''} onChange={(e) => onChange({ description: e.target.value, product_id: undefined })} />} />
          </Field>
          <Field label="Qty"><input className="input num" type="number" min={0} step="any" value={line.qty ?? ''} onChange={(e) => onChange({ qty: e.target.value ? Number(e.target.value) : undefined })} /></Field>
          <Field label="Rate"><input className="input num" type="number" min={0} value={line.rate ?? (calc.list || '')} onChange={(e) => onChange({ rate: e.target.value === '' ? undefined : Number(e.target.value) })} /></Field>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {calc.ok && <Chip tone="brown">{fmt(calc.qty, 3)} {UOM_LABEL[calc.uom] ?? calc.uom}</Chip>}
        {calc.ok && <Chip>GST {fmt(calc.gst)}%</Chip>}
        {calc.ok && line.kind === 'sawn' && line.pieces ? <span className="text-ink-mute">= {line.pieces} × {fmt(calc.qty / line.pieces, 3)} CFT each</span> : null}
        {calc.warn && <Chip tone="red">{calc.warn}</Chip>}
        {!invoice && calc.warn.startsWith('Only') ? <span className="text-ink-mute">(fine for a quotation)</span> : null}
        {calc.ok && line.kind !== 'service' && (
          <input className="input input-sm ml-auto w-full sm:w-64" placeholder="Note on this item (optional)" value={line.note ?? ''} onChange={(e) => onChange({ note: e.target.value })} />
        )}
      </div>
    </div>
  )
}
