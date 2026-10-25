import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownLeft, ArrowUpRight, Ban, CheckCircle2, HandCoins, Send, Wallet } from 'lucide-react'
import { must, rpc, supabase } from '../../lib/supabase'
import { invalidateBusiness } from '../../lib/queryClient'
import { useAuth } from '../../lib/auth'
import { addDays, dateShort, monthStart, todayIST } from '../../lib/format'
import { Chip, Confirm, Empty, Money, PageHeader, SearchBox, SkeletonRows, Tabs, useDebounced } from '../../components/ui'
import { toast } from '../../components/Toast'
import { PaymentModal } from '../forms/PaymentModal'
import type { Payment } from '../types'

type Tab = 'all' | 'in' | 'out' | 'cheques'

export default function Payments() {
  const [sp, setSp] = useSearchParams()
  const { can } = useAuth()
  const tab = (sp.get('tab') as Tab) || 'all'
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const [from, setFrom] = useState(addDays(todayIST(), -59))
  const [modal, setModal] = useState<null | 'in' | 'out'>(null)
  const [action, setAction] = useState<{ p: Payment; status: 'cleared' | 'bounced' | 'void' } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { const n = sp.get('new'); if (n === 'in' || n === 'out') setModal(n) }, [sp])

  const list = useQuery({
    queryKey: ['payments', tab, from, dq],
    queryFn: async () => {
      let r = supabase.from('payments').select('*, parties(name), payment_allocations(id,amount,sales_doc_id,purchase_id,sales_docs(doc_no),purchases(ref_no))').order('pay_date', { ascending: false }).order('ref_no', { ascending: false }).limit(400)
      if (tab === 'cheques') r = r.eq('mode', 'cheque')
      else { r = r.gte('pay_date', from); if (tab !== 'all') r = r.eq('direction', tab) }
      if (dq) r = r.or(`ref_no.ilike.%${dq}%,reference.ilike.%${dq}%,party_name.ilike.%${dq}%`)
      return must(await r) as Payment[]
    },
  })
  const rows = list.data ?? []
  const live = rows.filter((p) => p.status === 'cleared' || p.status === 'pending')
  const tin = live.filter((p) => p.direction === 'in').reduce((a, p) => a + Number(p.amount), 0)
  const tout = live.filter((p) => p.direction === 'out').reduce((a, p) => a + Number(p.amount), 0)

  async function doAction(note: string) {
    if (!action) return
    setBusy(true)
    try {
      await rpc('set_payment_status', { p_id: action.p.id, p_status: action.status, p_note: note || null })
      invalidateBusiness()
      toast.success(action.status === 'cleared' ? 'Cheque cleared' : action.status === 'bounced' ? 'Marked bounced — bills are due again' : 'Payment voided')
      setAction(null)
      void list.refetch()
    } catch (e) { toast.error('Not updated', (e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div>
      <PageHeader icon={<Wallet className="size-5" />} title="Receipts & payments" subtitle="Cash, UPI, bank and cheques — every rupee in and out"
        actions={<>
          <button className="btn-leaf" onClick={() => setModal('in')}><HandCoins className="size-4" /> Received</button>
          {can('manager', 'accounts') && <button className="btn-primary" onClick={() => setModal('out')}><Send className="size-4" /> Paid out</button>}
        </>} />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Tabs value={tab} onChange={(v) => setSp({ tab: v })} items={[{ value: 'all', label: 'All' }, { value: 'in', label: 'Received' }, ...(can('manager', 'accounts') ? [{ value: 'out' as Tab, label: 'Paid' }] : []), { value: 'cheques', label: 'Cheques' }]} />
        {tab !== 'cheques' && <select className="input input-sm w-auto" value={from} onChange={(e) => setFrom(e.target.value)}>
          <option value={todayIST()}>Today</option><option value={addDays(todayIST(), -6)}>7 days</option><option value={monthStart()}>This month</option><option value={addDays(todayIST(), -59)}>60 days</option><option value="2000-01-01">All</option>
        </select>}
        <SearchBox value={q} onChange={setQ} placeholder="Ref, cheque no, UTR, name…" className="lg:ml-auto lg:w-72" />
      </div>
      <div className="mb-3 flex flex-wrap gap-4 text-sm">
        <span className="text-ink-soft">In <Money value={tin} strong className="text-leaf-600" /></span>
        {can('manager', 'accounts') && <span className="text-ink-soft">Out <Money value={tout} strong className="text-ember-600" /></span>}
      </div>
      <div className="card overflow-hidden">
        {list.isLoading ? <SkeletonRows /> : !rows.length ? <Empty icon={<Wallet className="size-7" />} title="No payments in this period" /> : (
          <ul className="divide-y divide-line/70">
            {rows.map((p) => (
              <li key={p.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5 ${p.status === 'void' || p.status === 'bounced' ? 'opacity-60' : ''}`}>
                <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${p.direction === 'in' ? 'bg-leaf-50 text-leaf-600' : 'bg-ember-50 text-ember-600'}`}>{p.direction === 'in' ? <ArrowDownLeft className="size-5" /> : <ArrowUpRight className="size-5" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{p.parties?.name ?? p.party_name ?? '—'}</span>
                  <span className="block truncate text-xs text-ink-soft">
                    {p.ref_no} · {dateShort(p.pay_date)} · {p.mode.toUpperCase()}{p.reference ? ` ${p.reference}` : ''} · {p.purpose}
                    {!!p.payment_allocations?.length && ` · for ${p.payment_allocations.map((a) => a.sales_docs?.doc_no ?? a.purchases?.ref_no).join(', ')}`}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {p.status !== 'cleared' && <Chip tone={p.status === 'pending' ? 'amber' : 'red'}>{p.status === 'pending' ? 'Cheque pending' : p.status}</Chip>}
                  <Money value={p.amount} strong className={p.direction === 'in' ? 'text-leaf-600' : 'text-ember-600'} />
                </span>
                {can('manager', 'accounts') && (p.status === 'pending' || p.status === 'cleared') && (
                  <span className="flex w-full justify-end gap-1.5 sm:w-auto">
                    {p.status === 'pending' && <button className="btn-soft btn-sm" onClick={() => setAction({ p, status: 'cleared' })}><CheckCircle2 className="size-3.5" /> Cleared</button>}
                    {p.mode === 'cheque' && <button className="btn-danger btn-sm" onClick={() => setAction({ p, status: 'bounced' })}>Bounced</button>}
                    {can('manager') && <button className="btn-ghost btn-sm" onClick={() => setAction({ p, status: 'void' })}><Ban className="size-3.5" /> Void</button>}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <PaymentModal open={!!modal} onClose={() => { setModal(null); if (sp.get('new')) setSp((s) => { s.delete('new'); return s }) }} direction={modal ?? 'in'} />
      <Confirm open={!!action} onClose={() => setAction(null)} onConfirm={doAction} busy={busy} danger={action?.status !== 'cleared'} needReason={action?.status !== 'cleared'}
        title={action?.status === 'cleared' ? `Cheque ${action?.p.reference ?? ''} cleared?` : action?.status === 'bounced' ? `Cheque ${action?.p.reference ?? ''} bounced?` : `Void ${action?.p.ref_no}?`}
        confirmLabel={action?.status === 'cleared' ? 'Mark cleared' : action?.status === 'bounced' ? 'Mark bounced' : 'Void payment'}
        body={action?.status === 'bounced' ? 'The bills it paid become due again. Remember to collect bank charges.' : action?.status === 'void' ? 'For wrong entries only. The bills it paid become due again.' : 'The money is now in the bank.'} />
    </div>
  )
}
