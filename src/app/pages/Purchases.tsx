import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { PackagePlus, Plus } from 'lucide-react'
import { must, supabase } from '../../lib/supabase'
import { dateShort, todayIST } from '../../lib/format'
import { Chip, Empty, Money, PageHeader, SearchBox, SkeletonRows, useDebounced } from '../../components/ui'
import type { Purchase } from '../types'

export default function Purchases() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const list = useQuery({
    queryKey: ['purchases', dq],
    queryFn: async () => {
      let r = supabase.from('purchases').select('*, parties(name)').order('bill_date', { ascending: false }).order('ref_no', { ascending: false }).limit(300)
      if (dq) r = r.or(`ref_no.ilike.%${dq}%,bill_no.ilike.%${dq}%,permit_no.ilike.%${dq}%,vehicle_no.ilike.%${dq}%`)
      return must(await r) as Purchase[]
    },
  })
  const rows = list.data ?? []
  const due = rows.filter((p) => p.status === 'posted').reduce((a, p) => a + Number(p.total) - Number(p.amount_paid), 0)
  return (
    <div>
      <PageHeader icon={<PackagePlus className="size-5" />} title="Purchases" subtitle="Logs, sawn timber, plywood and doors coming into the yard — with permits and landed cost"
        actions={<Link to="/app/purchases/new" className="btn-primary"><Plus className="size-4" /> New purchase</Link>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchBox value={q} onChange={setQ} placeholder="Bill no, permit no, vehicle…" className="w-full sm:w-80" />
        <span className="text-sm text-ink-soft sm:ml-auto">To pay suppliers: <Money value={due} strong className="text-ember-600" /></span>
      </div>
      <div className="card overflow-hidden">
        {list.isLoading ? <SkeletonRows /> : !rows.length ? <Empty icon={<PackagePlus className="size-7" />} title="No purchases yet" /> : (
          <div className="overflow-x-auto">
            <table className="table-x">
              <thead><tr><th>Ref</th><th>Date</th><th>Supplier</th><th>Bill / permit</th><th className="text-right">Total</th><th className="text-right">Balance</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((p) => {
                  const bal = Number(p.total) - Number(p.amount_paid)
                  return (
                    <tr key={p.id} className="cursor-pointer" onClick={() => nav(`/app/purchases/${p.id}`)}>
                      <td className="font-bold text-teak-700">{p.ref_no}{p.is_interstate && <Chip tone="blue">IGST</Chip>}</td>
                      <td className="text-ink-soft">{dateShort(p.bill_date)}</td>
                      <td className="font-semibold">{p.parties?.name}</td>
                      <td className="text-xs text-ink-soft">{p.bill_no ?? '—'}{p.permit_no && <span className="block">Permit {p.permit_no}</span>}</td>
                      <td className="text-right"><Money value={p.total} strong /></td>
                      <td className="text-right">{p.status === 'posted' && bal > 0.5 ? <Money value={bal} className={p.due_date && p.due_date < todayIST() ? 'text-ember-600' : ''} /> : <span className="text-ink-mute">—</span>}</td>
                      <td>{p.status === 'cancelled' ? <Chip tone="red">Cancelled</Chip> : bal > 0.5 ? <Chip tone="amber" dot>To pay</Chip> : <Chip tone="green">Paid</Chip>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
