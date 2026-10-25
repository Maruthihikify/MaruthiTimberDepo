import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { FileText, Plus, ReceiptIndianRupee } from 'lucide-react'
import { must, supabase } from '../../lib/supabase'
import { addDays, dateShort, monthStart, rupees, todayIST } from '../../lib/format'
import { useAuth } from '../../lib/auth'
import { Empty, Money, PageHeader, SearchBox, SkeletonRows, StatusChip, Tabs, Chip, useDebounced } from '../../components/ui'
import type { SalesDoc } from '../types'

type Tab = 'invoice' | 'quotation' | 'credit_note'
const RANGES = [
  { v: 'today', label: 'Today', from: () => todayIST() },
  { v: '7', label: '7 days', from: () => addDays(todayIST(), -6) },
  { v: 'month', label: 'This month', from: () => monthStart() },
  { v: '90', label: '90 days', from: () => addDays(todayIST(), -89) },
  { v: 'all', label: 'All', from: () => '2000-01-01' },
]

export default function SalesList() {
  const [sp, setSp] = useSearchParams()
  const nav = useNavigate()
  const { can } = useAuth()
  const tab = (sp.get('tab') as Tab) || 'invoice'
  const range = sp.get('range') || '90'
  const [q, setQ] = useState('')
  const [onlyDue, setOnlyDue] = useState(false)
  const dq = useDebounced(q)
  const from = (RANGES.find((r) => r.v === range) ?? RANGES[3]).from()

  const list = useQuery({
    queryKey: ['sales', tab, from, dq],
    queryFn: async () => {
      let r = supabase.from('sales_docs').select('id,doc_type,doc_no,doc_date,customer_name,customer_phone,total,amount_paid,credited_amount,status,due_date,valid_until,delivery_status,is_interstate,taxable')
        .eq('doc_type', tab).gte('doc_date', from).order('doc_date', { ascending: false }).order('doc_no', { ascending: false }).limit(500)
      if (dq) r = r.or(`doc_no.ilike.%${dq}%,customer_name.ilike.%${dq}%,customer_phone.ilike.%${dq}%`)
      return must(await r) as SalesDoc[]
    },
  })
  const rows = useMemo(() => (list.data ?? []).filter((d) => !onlyDue || (d.status === 'posted' && d.total - d.amount_paid - d.credited_amount > 0.5)), [list.data, onlyDue])
  const sum = rows.filter((d) => d.status !== 'cancelled').reduce((a, d) => ({ total: a.total + Number(d.total), due: a.due + (d.doc_type === 'invoice' ? Math.max(0, d.total - d.amount_paid - d.credited_amount) : 0) }), { total: 0, due: 0 })

  return (
    <div>
      <PageHeader icon={<FileText className="size-5" />} title="Bills & quotations" subtitle="Every tax invoice, quotation and return — search by number, name or phone"
        actions={can('manager', 'accounts', 'sales') && <>
          <Link to="/app/sales/new?type=quotation" className="btn-ghost"><FileText className="size-4" /> Quotation</Link>
          <Link to="/app/sales/new" className="btn-primary"><Plus className="size-4" /> New bill</Link>
        </>} />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Tabs value={tab} onChange={(v) => setSp((s) => { s.set('tab', v); return s })} items={[{ value: 'invoice', label: 'Invoices' }, { value: 'quotation', label: 'Quotations' }, { value: 'credit_note', label: 'Returns' }]} />
        <div className="no-scrollbar flex gap-1 overflow-x-auto">
          {RANGES.map((r) => (
            <button key={r.v} onClick={() => setSp((s) => { s.set('range', r.v); return s })} className={`whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold transition ${range === r.v ? 'bg-teak-500 text-white shadow-glow' : 'bg-paper text-ink-soft ring-1 ring-line hover:text-ink'}`}>{r.label}</button>
          ))}
        </div>
        <SearchBox value={q} onChange={setQ} placeholder="Bill no, customer, phone…" className="lg:ml-auto lg:w-72" />
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-line bg-cream/50 px-4 py-2.5 text-sm">
          <span className="text-ink-soft">{rows.length} documents</span>
          <span>Total <Money value={sum.total} strong /></span>
          {tab === 'invoice' && <span>Balance <Money value={sum.due} strong className="text-ember-600" /></span>}
          {tab === 'invoice' && <label className="ml-auto flex items-center gap-2 text-xs font-bold text-ink-soft"><input type="checkbox" className="accent-teak-500" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} /> Only unpaid</label>}
        </div>
        {list.isLoading ? <SkeletonRows /> : rows.length === 0 ? (
          <Empty icon={<ReceiptIndianRupee className="size-7" />} title="Nothing here yet" body="Try a wider date range or a different search." />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="table-x">
                <thead><tr><th>Number</th><th>Date</th><th>Customer</th><th className="text-right">Amount</th>{tab === 'invoice' && <th className="text-right">Balance</th>}<th>Status</th>{tab === 'invoice' && <th>Delivery</th>}</tr></thead>
                <tbody>
                  {rows.map((d) => {
                    const due = d.total - d.amount_paid - d.credited_amount
                    const overdue = d.status === 'posted' && due > 0.5 && d.due_date && d.due_date < todayIST()
                    return (
                      <tr key={d.id} className="cursor-pointer" onClick={() => nav(`/app/sales/${d.id}`)}>
                        <td className="font-bold text-teak-700">{d.doc_no}{d.is_interstate && <Chip tone="blue">IGST</Chip>}</td>
                        <td className="text-ink-soft">{dateShort(d.doc_date)}</td>
                        <td><span className="font-semibold">{d.customer_name}</span>{d.customer_phone && <span className="ml-2 text-xs text-ink-mute">{d.customer_phone}</span>}</td>
                        <td className="text-right"><Money value={d.total} strong /></td>
                        {tab === 'invoice' && <td className={`text-right ${overdue ? 'text-ember-600' : ''}`}>{d.status === 'posted' && due > 0.5 ? <Money value={due} /> : <span className="text-ink-mute">—</span>}</td>}
                        <td><StatusChip status={d.doc_type === 'quotation' && d.status === 'open' && d.valid_until && d.valid_until < todayIST() ? 'expired' : d.status} docType={d.doc_type} due={d.doc_type === 'invoice' && d.status === 'posted' ? due : undefined} />{overdue && <Chip tone="red">Overdue</Chip>}</td>
                        {tab === 'invoice' && <td>{d.delivery_status !== 'na' && <Chip tone={d.delivery_status === 'delivered' ? 'green' : d.delivery_status === 'dispatched' ? 'blue' : 'amber'}>{d.delivery_status}</Chip>}</td>}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-line md:hidden">
              {rows.map((d) => {
                const due = d.total - d.amount_paid - d.credited_amount
                return (
                  <li key={d.id}>
                    <Link to={`/app/sales/${d.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-teak-50">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{d.customer_name}</span>
                        <span className="text-xs text-ink-soft">{d.doc_no} · {dateShort(d.doc_date)}</span>
                      </span>
                      <span className="text-right">
                        <Money value={d.total} strong className="block" />
                        {d.doc_type === 'invoice' && d.status === 'posted' && due > 0.5 ? <span className="text-xs font-bold text-ember-600">Due {rupees(due)}</span> : <StatusChip status={d.status} docType={d.doc_type} due={d.doc_type === 'invoice' ? due : undefined} />}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
