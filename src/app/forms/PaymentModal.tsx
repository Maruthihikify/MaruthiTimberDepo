import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { HandCoins, Send } from 'lucide-react'
import { rpc, supabase } from '../../lib/supabase'
import { invalidateBusiness } from '../../lib/queryClient'
import { useAuth } from '../../lib/auth'
import { date, rupees, todayIST } from '../../lib/format'
import { useBalances } from '../data'
import { Field, Modal, Segmented, Money, Chip } from '../../components/ui'
import { Combobox } from '../../components/Combobox'
import { RingSpinner } from '../../components/Loader'
import { toast } from '../../components/Toast'

interface OpenBill { id: string; no: string; date: string; due: number; due_date: string | null }

export function PaymentModal({ open, onClose, direction: dir0 = 'in', partyId, partyName, invoice, purpose: purpose0 }: {
  open: boolean; onClose: () => void; direction?: 'in' | 'out'; partyId?: string | null; partyName?: string
  invoice?: { id: string; doc_no: string; due: number }; purpose?: string
}) {
  const { can } = useAuth()
  const balances = useBalances()
  const [direction, setDirection] = useState<'in' | 'out'>(dir0)
  const [party, setParty] = useState<string | null>(partyId ?? null)
  const [amount, setAmount] = useState<number | ''>('')
  const [mode, setMode] = useState('cash')
  const [reference, setReference] = useState('')
  const [chequeDate, setChequeDate] = useState('')
  const [payDate, setPayDate] = useState(todayIST())
  const [purpose, setPurpose] = useState(purpose0 ?? (dir0 === 'in' ? 'sale' : 'purchase'))
  const [notes, setNotes] = useState('')
  const [alloc, setAlloc] = useState<Record<string, number>>({})
  const [auto, setAuto] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setDirection(dir0); setParty(partyId ?? null); setMode('cash'); setReference(''); setChequeDate(''); setPayDate(todayIST())
    setPurpose(purpose0 ?? (dir0 === 'in' ? 'sale' : 'purchase')); setNotes(''); setAlloc({}); setAuto(!invoice)
    setAmount(invoice ? Math.round(invoice.due * 100) / 100 : '')
  }, [open, dir0, partyId, invoice, purpose0])

  const bal = (balances.data ?? []).find((b) => b.party_id === party)
  const openBills = useQuery({
    queryKey: ['open-bills', party, direction, purpose],
    enabled: open && !!party && !invoice && (direction === 'in' || purpose === 'purchase'),
    queryFn: async (): Promise<OpenBill[]> => {
      if (direction === 'in') {
        const { data } = await supabase.from('sales_docs').select('id,doc_no,doc_date,total,amount_paid,credited_amount,due_date').eq('customer_id', party!).eq('doc_type', 'invoice').eq('status', 'posted').order('doc_date')
        return (data ?? []).map((d) => ({ id: d.id, no: d.doc_no, date: d.doc_date, due: Number(d.total) - Number(d.amount_paid) - Number(d.credited_amount), due_date: d.due_date })).filter((b) => b.due > 0.004)
      }
      const { data } = await supabase.from('purchases').select('id,ref_no,bill_no,bill_date,total,amount_paid,due_date').eq('supplier_id', party!).eq('status', 'posted').order('bill_date')
      return (data ?? []).map((d) => ({ id: d.id, no: `${d.ref_no}${d.bill_no ? ` (${d.bill_no})` : ''}`, date: d.bill_date, due: Number(d.total) - Number(d.amount_paid), due_date: d.due_date })).filter((b) => b.due > 0.004)
    },
    meta: { persist: false },
  })

  const partyOptions = useMemo(() => (balances.data ?? []).filter((b) => b.active && (direction === 'in' ? b.is_customer : b.is_supplier || b.is_carpenter || b.is_customer)).map((b) => ({
    value: b.party_id, label: b.name, keywords: `${b.phone ?? ''} ${b.city ?? ''}`,
    hint: b.balance > 0 ? `Owes us ${rupees(b.balance)}` : b.balance < 0 ? `We owe ${rupees(-b.balance)}` : 'Settled',
  })), [balances.data, direction])

  const allocTotal = Object.values(alloc).reduce((a, b) => a + (b || 0), 0)

  function fillFifo(total: number) {
    let left = total
    const next: Record<string, number> = {}
    for (const b of openBills.data ?? []) {
      if (left <= 0) break
      const a = Math.min(left, Math.round(b.due * 100) / 100)
      next[b.id] = a
      left = Math.round((left - a) * 100) / 100
    }
    setAlloc(next)
  }

  async function save() {
    const amt = Number(amount)
    if (!party && !invoice) return toast.error('Choose the party')
    if (!(amt > 0)) return toast.error('Enter the amount')
    if (mode === 'cheque' && !reference.trim()) return toast.error('Enter the cheque number')
    if (!auto && allocTotal > amt + 0.001) return toast.error('Allocated more than the amount')
    setBusy(true)
    try {
      const allocations = invoice
        ? [{ sales_doc_id: invoice.id, amount: Math.min(amt, invoice.due) }]
        : auto ? undefined
        : Object.entries(alloc).filter(([, v]) => v > 0).map(([id, v]) => (direction === 'in' ? { sales_doc_id: id, amount: v } : { purchase_id: id, amount: v }))
      const r = await rpc<{ ref_no: string; unallocated: number }>('record_payment', {
        p: {
          direction, party_id: party, party_name: party ? undefined : partyName, amount: amt, mode, reference: reference.trim() || null,
          cheque_date: chequeDate || null, pay_date: payDate, purpose, notes: notes.trim() || null,
          allocations, auto_allocate: !invoice && auto,
        },
      })
      invalidateBusiness()
      toast.success(`${r.ref_no} saved`, Number(r.unallocated) > 0 ? `${rupees(r.unallocated)} kept as advance on the account` : mode === 'cheque' ? 'Cheque marked pending until it clears' : undefined)
      onClose()
    } catch (e) { toast.error('Not saved', (e as Error).message) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} wide title={invoice ? `Receive payment · ${invoice.doc_no}` : direction === 'in' ? 'Money received' : 'Money paid out'}
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className={direction === 'in' ? 'btn-leaf' : 'btn-primary'} onClick={save} disabled={busy}>{busy ? <RingSpinner size={16} /> : direction === 'in' ? <HandCoins className="size-4" /> : <Send className="size-4" />} Save {direction === 'in' ? 'receipt' : 'payment'}</button></>}>
      <div className="space-y-4">
        {!invoice && can('manager', 'accounts') && (
          <Segmented value={direction} onChange={(v) => { setDirection(v); setParty(null); setPurpose(v === 'in' ? 'sale' : 'purchase') }} items={[{ value: 'in', label: 'Received from' }, { value: 'out', label: 'Paid to' }]} />
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {!invoice ? (
            <Field label={direction === 'in' ? 'Received from' : 'Paid to'} className="sm:col-span-2">
              <Combobox value={party} onChange={(v) => { setParty(v); setAlloc({}) }} options={partyOptions} placeholder="Choose customer / supplier / carpenter…" />
            </Field>
          ) : <p className="text-sm text-ink-soft sm:col-span-2">From <b className="text-ink">{partyName}</b> · balance on this bill <b className="text-ember-600">{rupees(invoice.due)}</b></p>}
          {bal && !invoice && (
            <div className="sm:col-span-2 -mt-1 flex flex-wrap gap-2 text-xs">
              {bal.balance > 0 && <Chip tone="amber">Owes us {rupees(bal.balance)}</Chip>}
              {bal.balance < 0 && <Chip tone="blue">We owe {rupees(-bal.balance)}</Chip>}
              {bal.overdue > 0 && <Chip tone="red">{rupees(bal.overdue)} overdue</Chip>}
            </div>
          )}
          <Field label="Amount (₹)"><input className="input num text-lg font-bold" type="number" min={0} value={amount} onChange={(e) => { const v = e.target.value === '' ? '' : Number(e.target.value); setAmount(v); if (!auto) fillFifo(Number(v) || 0) }} autoFocus /></Field>
          <Field label="Date"><input className="input" type="date" max={todayIST()} value={payDate} onChange={(e) => setPayDate(e.target.value)} /></Field>
          <Field label="Mode">
            <select className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
              {['cash', 'upi', 'bank', 'cheque', 'card'].map((m) => <option key={m} value={m}>{m === 'bank' ? 'Bank transfer (NEFT/RTGS/IMPS)' : m.toUpperCase()}</option>)}
            </select>
          </Field>
          {mode !== 'cash' && <Field label={mode === 'cheque' ? 'Cheque number *' : 'Reference / UTR'}><input className="input" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>}
          {mode === 'cheque' && <Field label="Cheque date" hint="Stays 'pending' until you mark it cleared"><input className="input" type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} /></Field>}
          {direction === 'out' && !invoice && (
            <Field label="Purpose">
              <select className="input" value={purpose} onChange={(e) => { setPurpose(e.target.value); setAlloc({}) }}>
                <option value="purchase">Supplier bill payment</option>
                <option value="commission">Carpenter commission</option>
                <option value="refund">Refund to customer</option>
                <option value="advance">Advance</option>
                <option value="other">Other</option>
              </select>
            </Field>
          )}
          {direction === 'in' && !invoice && (
            <Field label="Purpose"><select className="input" value={purpose} onChange={(e) => setPurpose(e.target.value)}><option value="sale">Against bills</option><option value="advance">Advance for an order</option></select></Field>
          )}
          <Field label="Notes" className="sm:col-span-2"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>

        {!invoice && party && (direction === 'in' || purpose === 'purchase') && (
          <div className="rounded-2xl border border-line">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-cream/50 px-4 py-2.5">
              <p className="text-sm font-bold">Settle which bills?</p>
              <Segmented size="sm" value={auto ? 'auto' : 'pick'} onChange={(v) => { setAuto(v === 'auto'); if (v === 'pick') fillFifo(Number(amount) || 0) }} items={[{ value: 'auto', label: 'Oldest first' }, { value: 'pick', label: 'Choose' }]} />
            </div>
            {openBills.isLoading ? <div className="skeleton m-3 h-16" /> : !openBills.data?.length ? <p className="px-4 py-4 text-sm text-ink-soft">No open bills — the amount stays as an advance.</p> : (
              <ul className="max-h-56 divide-y divide-line/70 overflow-y-auto">
                {openBills.data.map((b) => (
                  <li key={b.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold">{b.no}</span> <span className="text-xs text-ink-soft">{date(b.date)}{b.due_date && b.due_date < todayIST() ? <span className="font-bold text-ember-600"> · overdue</span> : ''}</span>
                    </span>
                    <Money value={b.due} className="text-ink-soft" />
                    {!auto && <input type="number" min={0} max={b.due} className="input input-sm num w-28" value={alloc[b.id] ?? ''} onChange={(e) => setAlloc({ ...alloc, [b.id]: Math.min(b.due, Math.max(0, Number(e.target.value))) })} />}
                  </li>
                ))}
              </ul>
            )}
            {!auto && <p className="border-t border-line px-4 py-2 text-xs font-semibold text-ink-soft">Allocated {rupees(allocTotal)} of {rupees(Number(amount) || 0)}{Number(amount) - allocTotal > 0 ? ` · ${rupees(Number(amount) - allocTotal)} stays as advance` : ''}</p>}
          </div>
        )}
      </div>
    </Modal>
  )
}
