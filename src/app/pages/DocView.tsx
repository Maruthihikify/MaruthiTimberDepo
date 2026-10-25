import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { ArrowLeft, Ban, CheckCircle2, FileText, HandCoins, MessageCircle, Printer, RotateCcw, Truck, Undo2 } from 'lucide-react'
import { must, rpc, supabase } from '../../lib/supabase'
import { invalidateBusiness } from '../../lib/queryClient'
import { useAuth } from '../../lib/auth'
import { date, dateTime, fmt, rupees, rupees2, rupeesInWords, STATES, todayIST, whatsappLink } from '../../lib/format'
import { UOM_LABEL } from '../../lib/timber'
import { useSettings } from '../data'
import { Chip, Confirm, Empty, Field, Modal, Money, StatusChip } from '../../components/ui'
import { PageLoader, RingSpinner } from '../../components/Loader'
import { toast } from '../../components/Toast'
import { PaymentModal } from '../forms/PaymentModal'
import type { SalesDoc, SalesLine } from '../types'

const TITLE: Record<string, string> = { invoice: 'Tax Invoice', quotation: 'Quotation', credit_note: 'Credit Note' }

export default function DocView() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const { can } = useAuth()
  const settings = useSettings()
  const q = useQuery({
    queryKey: ['doc', id],
    queryFn: async () => must(await supabase.from('sales_docs').select('*, sales_lines(*)').eq('id', id!).single()) as SalesDoc,
  })
  const related = useQuery({
    queryKey: ['doc', id, 'related'],
    enabled: !!q.data,
    queryFn: async () => {
      const d = q.data!
      const [kids, src, allocs, carp] = await Promise.all([
        supabase.from('sales_docs').select('id,doc_no,doc_type,total,status,doc_date').eq('source_doc_id', d.id),
        d.source_doc_id ? supabase.from('sales_docs').select('id,doc_no,doc_type').eq('id', d.source_doc_id).single() : Promise.resolve({ data: null }),
        supabase.from('payment_allocations').select('amount, payments(ref_no,pay_date,mode,reference,status,direction)').eq('sales_doc_id', d.id),
        d.referred_by ? supabase.from('parties').select('name').eq('id', d.referred_by).single() : Promise.resolve({ data: null }),
      ])
      return { kids: kids.data ?? [], src: src.data as { id: string; doc_no: string; doc_type: string } | null, allocs: (allocs.data ?? []) as unknown as { amount: number; payments: { ref_no: string; pay_date: string; mode: string; reference: string | null; status: string; direction: string } }[], carpenter: (carp.data as { name: string } | null)?.name }
    },
  })
  const [cancelOpen, setCancelOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [returnOpen, setReturnOpen] = useState(false)
  const [delivOpen, setDelivOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (sp.get('print') === '1' && q.data && settings.data) {
      const t = setTimeout(() => window.print(), 450)
      return () => clearTimeout(t)
    }
  }, [sp, q.data, settings.data])

  if (q.isLoading) return <PageLoader />
  if (q.error || !q.data) return <Empty title="Document not found" body={(q.error as Error)?.message} />
  const d = q.data
  const co = settings.data
  const lines = [...(d.sales_lines ?? [])].sort((a, b) => a.line_no - b.line_no)
  const due = d.doc_type === 'invoice' ? Number(d.total) - Number(d.amount_paid) - Number(d.credited_amount) : 0
  const expired = d.doc_type === 'quotation' && d.status === 'open' && d.valid_until && d.valid_until < todayIST()

  async function cancel(reason: string) {
    setBusy(true)
    try {
      await rpc('cancel_sale', { p_id: d.id, p_reason: reason })
      invalidateBusiness()
      toast.success(`${d.doc_no} cancelled`, d.doc_type === 'invoice' ? 'Stock is back in the yard.' : undefined)
      setCancelOpen(false)
      void q.refetch()
    } catch (e) { toast.error('Could not cancel', (e as Error).message) } finally { setBusy(false) }
  }

  const shareText = `${co?.name ?? 'Maruthi Timber Depot'}\n${TITLE[d.doc_type]} ${d.doc_no} · ${date(d.doc_date)}\nAmount: ${rupees(d.total)}${due > 0.5 ? `\nBalance due: ${rupees(due)}${d.due_date ? ` by ${date(d.due_date)}` : ''}` : ''}${co?.upi_id ? `\nPay by UPI: ${co.upi_id}` : ''}\nThank you!`

  return (
    <div>
      {/* actions */}
      <div className="no-print mb-5 flex flex-wrap items-center gap-2">
        <button className="btn-ghost" onClick={() => nav(-1)}><ArrowLeft className="size-4" /> Back</button>
        <div className="mr-auto flex items-center gap-2">
          <h1 className="font-display text-2xl font-semibold">{d.doc_no}</h1>
          <StatusChip status={expired ? 'expired' : d.status} docType={d.doc_type} due={d.doc_type === 'invoice' && d.status === 'posted' ? due : undefined} />
        </div>
        <button className="btn-ghost" onClick={() => window.print()}><Printer className="size-4" /> Print / PDF</button>
        <a className="btn-ghost" target="_blank" rel="noreferrer" href={whatsappLink(d.customer_phone, shareText)}><MessageCircle className="size-4 text-leaf-500" /> WhatsApp</a>
        {d.doc_type === 'quotation' && d.status === 'open' && can('manager', 'accounts', 'sales') && (
          <Link className="btn-primary" to={`/app/sales/new?from=${d.id}`}><FileText className="size-4" /> Convert to bill</Link>
        )}
        {d.doc_type === 'invoice' && d.status === 'posted' && due > 0.5 && can('manager', 'accounts', 'sales') && (
          <button className="btn-leaf" onClick={() => setPayOpen(true)}><HandCoins className="size-4" /> Receive {rupees(due)}</button>
        )}
        {d.doc_type === 'invoice' && d.status === 'posted' && can('manager', 'accounts') && (
          <button className="btn-soft" onClick={() => setReturnOpen(true)}><Undo2 className="size-4" /> Return goods</button>
        )}
        {d.doc_type === 'invoice' && d.status === 'posted' && d.delivery_status !== 'delivered' && (
          <button className="btn-soft" onClick={() => setDelivOpen(true)}><Truck className="size-4" /> Delivery</button>
        )}
        {d.status !== 'cancelled' && d.status !== 'converted' && (d.doc_type === 'quotation' ? can('manager', 'accounts', 'sales') : can('manager')) && (
          <button className="btn-danger" onClick={() => setCancelOpen(true)}><Ban className="size-4" /> Cancel</button>
        )}
      </div>

      {d.status === 'cancelled' && (
        <div className="no-print mb-4 rounded-2xl border border-ember-100 bg-ember-50 px-4 py-3 text-sm text-ember-600"><b>Cancelled</b> {d.cancel_reason ? `— ${d.cancel_reason}` : ''}</div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Invoice doc={d} lines={lines} co={co} carpenter={related.data?.carpenter} />

        <aside className="no-print space-y-4">
          {d.doc_type === 'invoice' && (
            <div className="card p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-mute">Money</p>
              <dl className="mt-2 space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-ink-soft">Bill total</dt><dd><Money value={d.total} strong /></dd></div>
                <div className="flex justify-between"><dt className="text-ink-soft">Received</dt><dd><Money value={d.amount_paid} /></dd></div>
                {Number(d.credited_amount) > 0 && <div className="flex justify-between"><dt className="text-ink-soft">Returns adjusted</dt><dd><Money value={d.credited_amount} /></dd></div>}
                <div className="flex justify-between border-t border-line pt-1.5"><dt className="font-bold">Balance</dt><dd><Money value={Math.max(due, 0)} strong className={due > 0.5 ? 'text-ember-600' : 'text-leaf-600'} /></dd></div>
                {due > 0.5 && d.due_date && <p className={`text-xs font-semibold ${d.due_date < todayIST() ? 'text-ember-600' : 'text-ink-soft'}`}>Due {date(d.due_date)}</p>}
              </dl>
              {!!related.data?.allocs.length && (
                <ul className="mt-3 space-y-1.5 border-t border-line pt-3 text-xs">
                  {related.data.allocs.map((a, i) => (
                    <li key={i} className="flex items-center justify-between gap-2">
                      <span className="text-ink-soft">{a.payments.ref_no} · {date(a.payments.pay_date)} · {a.payments.mode.toUpperCase()}</span>
                      <span className="flex items-center gap-1"><Money value={a.amount} />{a.payments.status !== 'cleared' && <Chip tone={a.payments.status === 'pending' ? 'amber' : 'red'}>{a.payments.status}</Chip>}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {d.doc_type === 'invoice' && can('manager', 'accounts') && (
            <div className="card p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-mute">Margin on this bill</p>
              <p className="mt-1 font-display text-2xl font-semibold text-leaf-600"><Money value={Number(d.taxable) - Number(d.cost_total)} /></p>
              <p className="text-xs text-ink-soft">{Number(d.taxable) > 0 ? fmt(((Number(d.taxable) - Number(d.cost_total)) / Number(d.taxable)) * 100, 1) : 0}% on taxable value (cost {rupees(d.cost_total)}){Number(d.commission_amount) > 0 ? ` · commission ${rupees2(d.commission_amount)}` : ''}</p>
            </div>
          )}
          {d.delivery_mode === 'delivery' && d.doc_type === 'invoice' && (
            <div className="card p-4 text-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-mute">Delivery</p>
              <div className="mt-2 flex items-center gap-2">
                <Truck className="size-4 text-teak-500" />
                <Chip tone={d.delivery_status === 'delivered' ? 'green' : d.delivery_status === 'dispatched' ? 'blue' : 'amber'}>{d.delivery_status}</Chip>
              </div>
              <p className="mt-2 text-ink-soft">{d.delivery_address || 'No address'}</p>
              {(d.vehicle_no || d.driver_name) && <p className="text-ink-soft">{[d.vehicle_no, d.driver_name].filter(Boolean).join(' · ')}</p>}
              {d.delivered_at && <p className="text-xs text-leaf-600">Delivered {dateTime(d.delivered_at)}</p>}
            </div>
          )}
          {(related.data?.src || !!related.data?.kids.length) && (
            <div className="card p-4 text-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-mute">Linked</p>
              <ul className="mt-2 space-y-1.5">
                {related.data?.src && <li><Link className="font-semibold text-teak-700 hover:underline" to={`/app/sales/${related.data.src.id}`}>{related.data.src.doc_no}</Link> <span className="text-ink-soft">({related.data.src.doc_type.replace('_', ' ')})</span></li>}
                {related.data?.kids.map((k) => <li key={k.id}><Link className="font-semibold text-teak-700 hover:underline" to={`/app/sales/${k.id}`}>{k.doc_no}</Link> <span className="text-ink-soft">{k.doc_type.replace('_', ' ')} · {rupees(k.total)} {k.status === 'cancelled' && '(cancelled)'}</span></li>)}
              </ul>
            </div>
          )}
        </aside>
      </div>

      <Confirm open={cancelOpen} onClose={() => setCancelOpen(false)} onConfirm={cancel} busy={busy} danger needReason
        title={`Cancel ${d.doc_no}?`} confirmLabel="Cancel document"
        body={d.doc_type === 'invoice' ? 'All items go back into stock. Money received from an account customer stays on their account as advance; walk-in money is marked refunded.' : d.doc_type === 'credit_note' ? 'The returned goods are taken out of stock again and the invoice balance is restored.' : 'The quotation will be closed.'} />
      {d.doc_type === 'invoice' && <PaymentModal open={payOpen} onClose={() => { setPayOpen(false); void q.refetch(); void related.refetch() }} direction="in" partyId={d.customer_id} partyName={d.customer_name} invoice={{ id: d.id, doc_no: d.doc_no, due }} />}
      {d.doc_type === 'invoice' && <ReturnModal open={returnOpen} onClose={() => setReturnOpen(false)} doc={d} lines={lines} onDone={(newId) => { setReturnOpen(false); nav(`/app/sales/${newId}`) }} />}
      {d.doc_type === 'invoice' && <DeliveryModal open={delivOpen} onClose={() => setDelivOpen(false)} doc={d} onDone={() => { setDelivOpen(false); void q.refetch() }} />}
    </div>
  )
}

// ───────────────────────── printable GST invoice ─────────────────────────
import type { CompanySettings } from '../types'

export function Invoice({ doc: d, lines, co, carpenter }: { doc: SalesDoc; lines: SalesLine[]; co?: CompanySettings; carpenter?: string }) {
  const inter = d.is_interstate
  const hsn = useMemo(() => {
    const m = new Map<string, { hsn: string; rate: number; taxable: number; cgst: number; sgst: number; igst: number }>()
    for (const l of lines) {
      const k = `${l.hsn}|${l.gst_rate}`
      const r = m.get(k) ?? { hsn: l.hsn ?? '-', rate: Number(l.gst_rate), taxable: 0, cgst: 0, sgst: 0, igst: 0 }
      r.taxable += Number(l.taxable); r.cgst += Number(l.cgst); r.sgst += Number(l.sgst); r.igst += Number(l.igst)
      m.set(k, r)
    }
    return [...m.values()]
  }, [lines])
  const cftTotal = lines.filter((l) => l.uom === 'cft').reduce((a, l) => a + Number(l.qty), 0)

  return (
    <motion.article initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-2xl border border-line bg-white shadow-card print:rounded-none print:border-0 print:shadow-none">
      {d.status === 'cancelled' && <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center"><span className="-rotate-[18deg] rounded-xl border-[6px] border-ember-500/60 px-8 py-2 font-display text-6xl font-bold uppercase tracking-widest text-ember-500/60">Cancelled</span></div>}
      <div className="h-2 bg-gradient-to-r from-teak-300 via-teak-500 to-teak-700" />
      <div className="p-5 sm:p-8 print:p-0 print:pt-2">
        <header className="flex flex-col gap-4 border-b-2 border-teak-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <img src="/favicon.svg" alt="" className="size-14" />
            <div>
              <p className="font-display text-2xl font-semibold leading-tight">{co?.name ?? 'Maruthi Timber Depot'}</p>
              <p className="text-xs font-semibold text-teak-700">{co?.tagline}</p>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-ink-soft">
                {[co?.address, co?.city, co?.pincode].filter(Boolean).join(', ') || 'Address — set in Settings'}<br />
                {co?.state_name} ({co?.state_code}){co?.phone ? ` · ${co.phone}` : ''}{co?.email ? ` · ${co.email}` : ''}
              </p>
              <p className="mt-1 text-xs font-bold">GSTIN: {co?.gstin || '— set in Settings'}</p>
            </div>
          </div>
          <div className="sm:text-right">
            <p className="font-display text-xl font-semibold uppercase tracking-[0.18em] text-teak-700">{TITLE[d.doc_type]}</p>
            <p className="num mt-1 text-lg font-bold">{d.doc_no}</p>
            <p className="text-sm text-ink-soft">Date: <b className="text-ink">{date(d.doc_date)}</b></p>
            {d.doc_type === 'invoice' && d.due_date && <p className="text-sm text-ink-soft">Due: {date(d.due_date)}</p>}
            {d.doc_type === 'quotation' && d.valid_until && <p className="text-sm text-ink-soft">Valid till: {date(d.valid_until)}</p>}
          </div>
        </header>

        <section className="grid gap-4 border-b border-line py-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-mute">Bill to</p>
            <p className="mt-1 font-bold">{d.customer_name}</p>
            {d.billing_address && <p className="text-ink-soft">{d.billing_address}</p>}
            {d.customer_phone && <p className="text-ink-soft">Ph: {d.customer_phone}</p>}
            {d.customer_gstin && <p className="font-semibold">GSTIN: {d.customer_gstin}</p>}
          </div>
          <div className="sm:text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-mute">Place of supply</p>
            <p className="mt-1 font-bold">{STATES[d.place_of_supply] ?? d.place_of_supply} ({d.place_of_supply})</p>
            {d.delivery_mode === 'delivery' && <p className="text-ink-soft">Deliver to: {d.delivery_address || '—'}{d.vehicle_no ? ` · ${d.vehicle_no}` : ''}</p>}
            {d.doc_type === 'credit_note' && <p className="text-ink-soft">Reason: {d.notes}</p>}
          </div>
        </section>

        <div className="-mx-5 overflow-x-auto sm:mx-0">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="border-b-2 border-teak-200 text-left text-[10.5px] font-bold uppercase tracking-wider text-ink-soft">
                <th className="py-2 pl-5 pr-2 sm:pl-0">#</th>
                <th className="py-2 pr-2">Description</th>
                <th className="py-2 pr-2">HSN</th>
                <th className="py-2 pr-2 text-right">Qty</th>
                <th className="py-2 pr-2 text-right">Rate</th>
                <th className="py-2 pr-2 text-right">Taxable</th>
                <th className="py-2 pr-5 text-right sm:pr-0">GST</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-b border-line/70 align-top">
                  <td className="py-2 pl-5 pr-2 text-ink-mute sm:pl-0">{l.line_no}</td>
                  <td className="py-2 pr-2 font-semibold">{l.description}{Number(l.discount_pct) > 0 && <span className="font-normal text-ink-soft"> · less {fmt(l.discount_pct)}%</span>}</td>
                  <td className="py-2 pr-2 text-ink-soft">{l.hsn}</td>
                  <td className="num py-2 pr-2 text-right">{fmt(l.qty, 3)} <span className="text-ink-mute">{UOM_LABEL[l.uom] ?? l.uom}</span></td>
                  <td className="num py-2 pr-2 text-right">{rupees2(l.rate)}</td>
                  <td className="num py-2 pr-2 text-right">{rupees2(l.taxable)}</td>
                  <td className="num py-2 pr-5 text-right text-ink-soft sm:pr-0">{fmt(l.gst_rate)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="mt-4 grid gap-5 sm:grid-cols-[1fr_280px]">
          <div className="space-y-3 text-xs">
            {cftTotal > 0 && <p className="font-semibold text-ink-soft">Total timber: <b className="num text-ink">{fmt(cftTotal, 3)} CFT</b> ({fmt(cftTotal / 35.3147, 3)} m³)</p>}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[300px]">
                <thead><tr className="text-left text-[10px] font-bold uppercase tracking-wider text-ink-mute"><th className="py-1">HSN</th><th className="text-right">Taxable</th>{inter ? <th className="text-right">IGST</th> : <><th className="text-right">CGST</th><th className="text-right">SGST</th></>}</tr></thead>
                <tbody>
                  {hsn.map((h) => (
                    <tr key={h.hsn + h.rate} className="border-t border-line/60">
                      <td className="py-1">{h.hsn} @ {fmt(h.rate)}%</td>
                      <td className="num text-right">{rupees2(h.taxable)}</td>
                      {inter ? <td className="num text-right">{rupees2(h.igst)}</td> : <><td className="num text-right">{rupees2(h.cgst)} <span className="text-ink-mute">({fmt(h.rate / 2)}%)</span></td><td className="num text-right">{rupees2(h.sgst)}</td></>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="rounded-xl bg-teak-50 px-3 py-2 font-semibold text-teak-800">{rupeesInWords(d.total)}</p>
            {carpenter && d.doc_type === 'invoice' && <p className="no-print text-ink-mute">Referred by {carpenter}</p>}
          </div>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-ink-soft">Items value</dt><dd className="num">{rupees2(d.subtotal)}</dd></div>
            {Number(d.discount) > 0 && <div className="flex justify-between"><dt className="text-ink-soft">Discount</dt><dd className="num">−{rupees2(d.discount)}</dd></div>}
            <div className="flex justify-between"><dt className="text-ink-soft">Taxable value</dt><dd className="num font-semibold">{rupees2(d.taxable)}</dd></div>
            {inter ? <div className="flex justify-between"><dt className="text-ink-soft">IGST</dt><dd className="num">{rupees2(d.igst)}</dd></div> : <>
              <div className="flex justify-between"><dt className="text-ink-soft">CGST</dt><dd className="num">{rupees2(d.cgst)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-soft">SGST</dt><dd className="num">{rupees2(d.sgst)}</dd></div>
            </>}
            <div className="flex justify-between"><dt className="text-ink-soft">Round off</dt><dd className="num">{rupees2(d.round_off)}</dd></div>
            <div className="flex justify-between border-t-2 border-teak-200 pt-2 text-base"><dt className="font-bold">Total</dt><dd className="num font-display text-xl font-bold">{rupees(d.total)}</dd></div>
            {d.doc_type === 'invoice' && Number(d.amount_paid) > 0 && <div className="flex justify-between text-xs"><dt className="text-ink-soft">Received</dt><dd className="num">{rupees2(d.amount_paid)}</dd></div>}
          </dl>
        </section>

        <footer className="mt-6 grid gap-5 border-t border-line pt-4 text-[11px] text-ink-soft sm:grid-cols-[1fr_auto]">
          <div>
            {(co?.bank_name || co?.upi_id) && (
              <p className="mb-2"><b className="text-ink">Payment:</b> {[co?.bank_name && `${co.bank_name} A/c ${co.bank_account ?? ''} IFSC ${co.bank_ifsc ?? ''}`, co?.upi_id && `UPI ${co.upi_id}`].filter(Boolean).join(' · ')}</p>
            )}
            {d.doc_type !== 'credit_note' && <p className="whitespace-pre-line">{co?.invoice_terms}</p>}
            {d.notes && d.doc_type !== 'credit_note' && <p className="mt-2"><b className="text-ink">Note:</b> {d.notes}</p>}
          </div>
          <div className="text-center sm:pl-10">
            <div className="h-14" />
            <p className="border-t border-ink-mute/50 pt-1 font-semibold text-ink">For {co?.name ?? 'Maruthi Timber Depot'}</p>
            <p>Authorised signatory</p>
          </div>
        </footer>
        <p className="mt-4 text-center text-[10px] text-ink-mute">This is a computer generated document.</p>
      </div>
    </motion.article>
  )
}

// ───────────────────────── returns ─────────────────────────
function ReturnModal({ open, onClose, doc, lines, onDone }: { open: boolean; onClose: () => void; doc: SalesDoc; lines: SalesLine[]; onDone: (id: string) => void }) {
  const [qty, setQty] = useState<Record<string, number>>({})
  const [reason, setReason] = useState('')
  const [restock, setRestock] = useState(true)
  const [refund, setRefund] = useState('')
  const [busy, setBusy] = useState(false)
  const returned = useQuery({
    queryKey: ['doc', doc.id, 'returned'],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from('sales_lines').select('source_line_id, pieces, qty, sales_docs!inner(status)').in('source_line_id', lines.map((l) => l.id)).eq('sales_docs.status', 'posted')
      const m = new Map<string, number>()
      for (const r of (data ?? []) as unknown as { source_line_id: string; pieces: number | null; qty: number }[]) m.set(r.source_line_id, (m.get(r.source_line_id) ?? 0) + Number(r.pieces ?? r.qty))
      return m
    },
  })
  useEffect(() => { if (open) { setQty({}); setReason(''); setRestock(true); setRefund('') } }, [open])
  const byPieces = (l: SalesLine) => ['sawn', 'panel', 'log'].includes(l.line_kind)
  async function submit() {
    const ls = Object.entries(qty).filter(([, v]) => v > 0).map(([line_id, v]) => {
      const l = lines.find((x) => x.id === line_id)!
      return byPieces(l) ? { line_id, pieces: v } : { line_id, qty: v }
    })
    if (!ls.length) return toast.error('Enter what is coming back')
    if (reason.trim().length < 3) return toast.error('Give the reason for the return')
    setBusy(true)
    try {
      const r = await rpc<{ id: string; doc_no: string; total: number; refunded_or_credit: number }>('post_credit_note', { p: { invoice_id: doc.id, reason: reason.trim(), restock, lines: ls, refund: refund ? { mode: refund } : null } })
      invalidateBusiness()
      toast.success(`${r.doc_no} saved`, `${rupees(r.total)} credited${restock ? ' · stock updated' : ''}`)
      onDone(r.id)
    } catch (e) { toast.error('Return not saved', (e as Error).message) } finally { setBusy(false) }
  }
  return (
    <Modal open={open} onClose={onClose} wide title={`Goods returned against ${doc.doc_no}`}
      footer={<><button className="btn-ghost" onClick={onClose}>Close</button><button className="btn-primary" onClick={submit} disabled={busy}>{busy ? <RingSpinner size={16} /> : <RotateCcw className="size-4" />} Save credit note</button></>}>
      <div className="space-y-2">
        {lines.map((l) => {
          const done = returned.data?.get(l.id) ?? 0
          const max = (byPieces(l) ? Number(l.pieces) : Number(l.qty)) - done
          return (
            <div key={l.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{l.description}</p>
                <p className="text-xs text-ink-soft">{byPieces(l) ? `${fmt(l.pieces)} ${l.line_kind === 'panel' ? 'sheets' : 'pcs'}` : `${fmt(l.qty)} ${UOM_LABEL[l.uom] ?? l.uom}`} sold{done ? ` · ${fmt(done)} already returned` : ''}</p>
              </div>
              <input type="number" min={0} max={max} step={byPieces(l) ? 1 : 'any'} disabled={max <= 0} className="input input-sm num w-24" placeholder="0"
                value={qty[l.id] ?? ''} onChange={(e) => setQty({ ...qty, [l.id]: Math.min(max, Math.max(0, Number(e.target.value))) })} />
            </div>
          )
        })}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Reason *" className="sm:col-span-2"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. 2 pieces unused at site" /></Field>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="size-4 accent-teak-500" checked={restock} onChange={(e) => setRestock(e.target.checked)} /> Put the goods back into stock</label>
        <Field label="Refund money now?" hint={doc.customer_id ? 'Leave empty to keep it as credit on the account' : 'Walk-in returns must be refunded'}>
          <select className="input" value={refund} onChange={(e) => setRefund(e.target.value)}>
            <option value="">{doc.customer_id ? 'No — adjust / keep as credit' : 'Choose…'}</option>
            {['cash', 'upi', 'bank'].map((m) => <option key={m} value={m}>Refund by {m.toUpperCase()}</option>)}
          </select>
        </Field>
      </div>
    </Modal>
  )
}

function DeliveryModal({ open, onClose, doc, onDone }: { open: boolean; onClose: () => void; doc: SalesDoc; onDone: () => void }) {
  const [v, setV] = useState({ vehicle: doc.vehicle_no ?? '', driver: doc.driver_name ?? '', phone: doc.driver_phone ?? '' })
  const [busy, setBusy] = useState(false)
  async function set(status: 'pending' | 'dispatched' | 'delivered') {
    setBusy(true)
    try {
      await rpc('update_delivery', { p_id: doc.id, p_status: status, p_vehicle: v.vehicle, p_driver: v.driver, p_phone: v.phone })
      invalidateBusiness()
      toast.success(status === 'delivered' ? 'Marked delivered' : status === 'dispatched' ? 'On the way' : 'Delivery scheduled')
      onDone()
    } catch (e) { toast.error('Not updated', (e as Error).message) } finally { setBusy(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title={`Delivery · ${doc.doc_no}`}
      footer={<>
        {doc.delivery_status === 'na' && <button className="btn-ghost" disabled={busy} onClick={() => set('pending')}>Schedule</button>}
        {doc.delivery_status !== 'dispatched' && <button className="btn-soft" disabled={busy} onClick={() => set('dispatched')}><Truck className="size-4" /> Dispatched</button>}
        <button className="btn-leaf" disabled={busy} onClick={() => set('delivered')}><CheckCircle2 className="size-4" /> Delivered</button>
      </>}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Vehicle"><input className="input uppercase placeholder:normal-case" value={v.vehicle} onChange={(e) => setV({ ...v, vehicle: e.target.value })} /></Field>
        <Field label="Driver"><input className="input" value={v.driver} onChange={(e) => setV({ ...v, driver: e.target.value })} /></Field>
        <Field label="Driver phone"><input className="input" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} /></Field>
      </div>
      <p className="mt-3 text-sm text-ink-soft">Deliver to: {doc.delivery_address || doc.billing_address || '—'}</p>
    </Modal>
  )
}
