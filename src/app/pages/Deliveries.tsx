import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { motion } from 'motion/react'
import { CheckCircle2, MapPin, Phone, Truck } from 'lucide-react'
import { must, rpc, supabase } from '../../lib/supabase'
import { invalidateBusiness } from '../../lib/queryClient'
import { addDays, dateShort, dateTime, phoneLink, rupees, todayIST } from '../../lib/format'
import { Empty, PageHeader } from '../../components/ui'
import { toast } from '../../components/Toast'
import type { SalesDoc } from '../types'

const COLS = [
  { key: 'pending', title: 'To dispatch', tone: 'from-sun-100 to-paper', dot: 'bg-sun-400' },
  { key: 'dispatched', title: 'On the road', tone: 'from-sky-50 to-paper', dot: 'bg-sky-500' },
  { key: 'delivered', title: 'Delivered (7 days)', tone: 'from-leaf-50 to-paper', dot: 'bg-leaf-500' },
] as const

export default function Deliveries() {
  const q = useQuery({
    queryKey: ['deliveries'],
    queryFn: async () => must(await supabase.from('sales_docs').select('id,doc_no,doc_date,customer_name,customer_phone,delivery_address,vehicle_no,driver_name,driver_phone,delivery_status,dispatched_at,delivered_at,total,sales_lines(qty,uom)')
      .eq('doc_type', 'invoice').eq('status', 'posted').in('delivery_status', ['pending', 'dispatched', 'delivered']).or(`delivery_status.neq.delivered,delivered_at.gte.${addDays(todayIST(), -7)}`)
      .order('doc_date', { ascending: true })) as SalesDoc[],
    refetchInterval: 60_000,
  })
  async function move(d: SalesDoc, status: 'dispatched' | 'delivered') {
    try {
      await rpc('update_delivery', { p_id: d.id, p_status: status })
      invalidateBusiness()
      toast.success(status === 'delivered' ? `${d.doc_no} delivered` : `${d.doc_no} on the road`)
    } catch (e) { toast.error('Not updated', (e as Error).message) }
  }
  const rows = q.data ?? []
  return (
    <div>
      <PageHeader icon={<Truck className="size-5" />} title="Deliveries" subtitle="Bills going to site — load, dispatch, deliver" />
      {q.isLoading ? <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-64" />)}</div> : !rows.length ? (
        <div className="card"><Empty icon={<Truck className="size-7" />} title="No deliveries scheduled" body="Choose 'We deliver' on a bill to see it here." /></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {COLS.map((c) => {
            const items = rows.filter((r) => r.delivery_status === c.key)
            return (
              <section key={c.key} className={`rounded-3xl border border-line bg-gradient-to-b ${c.tone} p-3`}>
                <h3 className="mb-3 flex items-center gap-2 px-1 font-display text-lg font-semibold"><span className={`size-2.5 rounded-full ${c.dot}`} />{c.title}<span className="ml-auto rounded-full bg-paper px-2 text-xs font-bold text-ink-soft shadow-sm">{items.length}</span></h3>
                <div className="space-y-2.5">
                  {items.map((d, i) => {
                    const cftQty = (d.sales_lines ?? []).filter((l) => l.uom === 'cft').reduce((a, l) => a + Number(l.qty), 0)
                    return (
                      <motion.div key={d.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="card p-3.5">
                        <div className="flex items-start justify-between gap-2">
                          <Link to={`/app/sales/${d.id}`} className="font-bold hover:text-teak-700">{d.customer_name}</Link>
                          <span className="text-xs font-semibold text-ink-soft">{d.doc_no}</span>
                        </div>
                        <p className="mt-1 flex items-start gap-1.5 text-xs text-ink-soft"><MapPin className="mt-0.5 size-3.5 shrink-0" />{d.delivery_address || 'No address on bill'}</p>
                        <p className="mt-1 text-xs text-ink-soft">{dateShort(d.doc_date)} · {rupees(d.total)}{cftQty > 0 ? ` · ${cftQty.toFixed(2)} CFT` : ''}</p>
                        {(d.vehicle_no || d.driver_name) && <p className="mt-1 text-xs font-semibold text-sky-600"><Truck className="mr-1 inline size-3.5" />{[d.vehicle_no, d.driver_name].filter(Boolean).join(' · ')}</p>}
                        {d.delivered_at && <p className="mt-1 text-xs font-semibold text-leaf-600">Delivered {dateTime(d.delivered_at)}</p>}
                        <div className="mt-2.5 flex gap-1.5">
                          {d.customer_phone && <a href={`tel:${phoneLink(d.customer_phone)}`} className="btn-ghost btn-sm"><Phone className="size-3.5" /></a>}
                          {d.delivery_status === 'pending' && <button className="btn-soft btn-sm flex-1" onClick={() => move(d, 'dispatched')}><Truck className="size-3.5" /> Dispatch</button>}
                          {d.delivery_status !== 'delivered' && <button className="btn-leaf btn-sm flex-1" onClick={() => move(d, 'delivered')}><CheckCircle2 className="size-3.5" /> Delivered</button>}
                        </div>
                      </motion.div>
                    )
                  })}
                  {!items.length && <p className="px-2 py-6 text-center text-xs text-ink-mute">Nothing here</p>}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
