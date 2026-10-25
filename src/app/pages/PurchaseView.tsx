import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Ban, Printer, Send } from 'lucide-react'
import { must, rpc, supabase } from '../../lib/supabase'
import { invalidateBusiness } from '../../lib/queryClient'
import { useAuth } from '../../lib/auth'
import { date, fmt, rupees, rupees2 } from '../../lib/format'
import { UOM_LABEL } from '../../lib/timber'
import { Chip, Confirm, Empty, Money } from '../../components/ui'
import { PageLoader } from '../../components/Loader'
import { toast } from '../../components/Toast'
import { PaymentModal } from '../forms/PaymentModal'
import type { Purchase } from '../types'

export default function PurchaseView() {
  const { id } = useParams()
  const nav = useNavigate()
  const { can } = useAuth()
  const [cancel, setCancel] = useState(false)
  const [pay, setPay] = useState(false)
  const [busy, setBusy] = useState(false)
  const q = useQuery({
    queryKey: ['purchases', 'one', id],
    queryFn: async () => must(await supabase.from('purchases').select('*, parties(name), purchase_lines(*)').eq('id', id!).single()) as Purchase,
  })
  if (q.isLoading) return <PageLoader />
  if (!q.data) return <Empty title="Purchase not found" />
  const p = q.data
  const bal = Number(p.total) - Number(p.amount_paid)
  const lines = [...(p.purchase_lines ?? [])].sort((a, b) => a.line_no - b.line_no)
  async function doCancel(reason: string) {
    setBusy(true)
    try { await rpc('cancel_purchase', { p_id: p.id, p_reason: reason }); invalidateBusiness(); toast.success('Purchase cancelled'); setCancel(false); void q.refetch() }
    catch (e) { toast.error('Cannot cancel', (e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div>
      <div className="no-print mb-5 flex flex-wrap items-center gap-2">
        <button className="btn-ghost" onClick={() => nav(-1)}><ArrowLeft className="size-4" /> Back</button>
        <h1 className="mr-auto font-display text-2xl font-semibold">{p.ref_no} {p.status === 'cancelled' && <Chip tone="red">Cancelled</Chip>}</h1>
        <button className="btn-ghost" onClick={() => window.print()}><Printer className="size-4" /> Print</button>
        {p.status === 'posted' && bal > 0.5 && <button className="btn-primary" onClick={() => setPay(true)}><Send className="size-4" /> Pay {rupees(bal)}</button>}
        {p.status === 'posted' && can('manager') && <button className="btn-danger" onClick={() => setCancel(true)}><Ban className="size-4" /> Cancel</button>}
      </div>
      <article className="card overflow-hidden">
        <div className="h-2 bg-gradient-to-r from-leaf-300 to-leaf-600" />
        <div className="grid gap-4 border-b border-line p-5 text-sm sm:grid-cols-3">
          <div><p className="text-[10px] font-bold uppercase tracking-wider text-ink-mute">Supplier</p><p className="font-bold">{p.parties?.name}</p><p className="text-ink-soft">Bill {p.bill_no ?? '—'} · {date(p.bill_date)}</p></div>
          <div><p className="text-[10px] font-bold uppercase tracking-wider text-ink-mute">Transport</p><p>Permit: <b>{p.permit_no ?? '—'}</b></p><p className="text-ink-soft">Vehicle {p.vehicle_no ?? '—'}{p.lot_code ? ` · ${p.lot_code}` : ''}</p></div>
          <div className="sm:text-right"><p className="text-[10px] font-bold uppercase tracking-wider text-ink-mute">Balance</p><p className="num font-display text-2xl font-semibold">{bal > 0.5 ? rupees(bal) : 'Paid'}</p>{p.due_date && bal > 0.5 && <p className="text-xs text-ink-soft">Due {date(p.due_date)}</p>}</div>
        </div>
        <div className="overflow-x-auto">
          <table className="table-x">
            <thead><tr><th>#</th><th>Item</th><th className="text-right">Qty</th><th className="text-right">Rate</th><th className="text-right">Amount</th><th className="text-right">GST</th>{can('manager', 'accounts') && <th className="text-right">Landed cost</th>}</tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td className="text-ink-mute">{l.line_no}</td>
                  <td className="font-semibold">{l.description}</td>
                  <td className="num text-right">{fmt(l.qty, 3)} {UOM_LABEL[l.uom] ?? l.uom}</td>
                  <td className="text-right"><Money value={l.rate} /></td>
                  <td className="text-right"><Money value={l.amount} strong /></td>
                  <td className="text-right text-ink-soft">{fmt(l.gst_rate)}%</td>
                  {can('manager', 'accounts') && <td className="text-right text-teak-700"><Money value={l.landed_unit_cost} />/{UOM_LABEL[l.uom] ?? l.uom}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="ml-auto max-w-sm space-y-1.5 p-5 text-sm">
          <div className="flex justify-between"><dt className="text-ink-soft">Goods</dt><dd className="num">{rupees2(p.subtotal)}</dd></div>
          {p.is_interstate ? <div className="flex justify-between"><dt className="text-ink-soft">IGST</dt><dd className="num">{rupees2(p.igst)}</dd></div> : <>
            <div className="flex justify-between"><dt className="text-ink-soft">CGST</dt><dd className="num">{rupees2(p.cgst)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-soft">SGST</dt><dd className="num">{rupees2(p.sgst)}</dd></div></>}
          <div className="flex justify-between"><dt className="text-ink-soft">Freight / unloading / other</dt><dd className="num">{rupees2(Number(p.freight) + Number(p.unloading) + Number(p.other_charges))}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-soft">Round off</dt><dd className="num">{rupees2(p.round_off)}</dd></div>
          <div className="flex justify-between border-t-2 border-leaf-200 pt-2"><dt className="font-bold">Total</dt><dd className="num font-display text-xl font-bold">{rupees(p.total)}</dd></div>
          <div className="flex justify-between text-xs"><dt className="text-ink-soft">Paid</dt><dd className="num">{rupees2(p.amount_paid)}</dd></div>
        </dl>
        {p.cancel_reason && <p className="border-t border-line px-5 py-3 text-sm text-ember-600">Cancelled: {p.cancel_reason}</p>}
      </article>
      <Confirm open={cancel} onClose={() => setCancel(false)} onConfirm={doCancel} busy={busy} danger needReason title={`Cancel ${p.ref_no}?`} confirmLabel="Cancel purchase"
        body="Only possible while every log from this bill is still in the yard and the sawn/plywood stock is still there. Payments stay as an advance to the supplier." />
      <PaymentModal open={pay} onClose={() => { setPay(false); void q.refetch() }} direction="out" partyId={p.supplier_id} purpose="purchase" />
    </div>
  )
}
