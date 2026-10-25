import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { motion } from 'motion/react'
import { Phone, Plus, Users } from 'lucide-react'
import { useBalances } from '../data'
import { dateShort, initials, phoneLink, rupees } from '../../lib/format'
import { Chip, Empty, Meter, Money, PageHeader, SearchBox, SkeletonRows, Tabs } from '../../components/ui'
import { PartyForm } from '../forms/PartyForm'

type Tab = 'customer' | 'supplier' | 'carpenter'
const COLORS = ['from-teak-300 to-teak-500', 'from-leaf-300 to-leaf-500', 'from-sky-400 to-sky-600', 'from-sun-300 to-sun-500', 'from-ember-400 to-ember-500', 'from-plum-100 to-plum-500']

export default function Parties() {
  const [sp, setSp] = useSearchParams()
  const tab = (sp.get('tab') as Tab) || 'customer'
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'name' | 'due'>('due')
  const [form, setForm] = useState(false)
  const balances = useBalances()

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (balances.data ?? [])
      .filter((b) => (tab === 'customer' ? b.is_customer : tab === 'supplier' ? b.is_supplier : b.is_carpenter))
      .filter((b) => !t || `${b.name} ${b.phone ?? ''} ${b.city ?? ''} ${b.category ?? ''}`.toLowerCase().includes(t))
      .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : tab === 'customer' ? b.balance - a.balance : a.balance - b.balance))
  }, [balances.data, tab, q, sort])

  const counts = useMemo(() => ({
    customer: (balances.data ?? []).filter((b) => b.is_customer).length,
    supplier: (balances.data ?? []).filter((b) => b.is_supplier).length,
    carpenter: (balances.data ?? []).filter((b) => b.is_carpenter).length,
  }), [balances.data])
  const totalDue = rows.reduce((a, b) => a + (tab === 'customer' ? Math.max(0, b.balance) : Math.max(0, -b.balance)), 0)

  return (
    <div>
      <PageHeader icon={<Users className="size-5" />} title="Customers & suppliers" subtitle="Balances, credit limits and statements"
        actions={<button className="btn-primary" onClick={() => setForm(true)}><Plus className="size-4" /> Add {tab === 'carpenter' ? 'carpenter' : tab}</button>} />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Tabs value={tab} onChange={(v) => setSp({ tab: v })} items={[{ value: 'customer', label: 'Customers', count: counts.customer }, { value: 'supplier', label: 'Suppliers', count: counts.supplier }, { value: 'carpenter', label: 'Carpenters', count: counts.carpenter }]} />
        <div className="flex items-center gap-2 lg:ml-auto">
          <select className="input input-sm w-auto" value={sort} onChange={(e) => setSort(e.target.value as 'name' | 'due')}><option value="due">Biggest balance first</option><option value="name">A → Z</option></select>
          <SearchBox value={q} onChange={setQ} placeholder="Name, phone, town…" className="w-full lg:w-64" />
        </div>
      </div>
      <p className="mb-3 text-sm text-ink-soft">{tab === 'customer' ? 'They owe us' : 'We owe them'}: <Money value={totalDue} strong className={tab === 'customer' ? 'text-ember-600' : 'text-teak-700'} /></p>

      {balances.isLoading ? <div className="card"><SkeletonRows /></div> : !rows.length ? <div className="card"><Empty icon={<Users className="size-7" />} title="Nobody here yet" /></div> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((b, i) => {
            const owes = tab === 'customer' ? b.balance : -b.balance
            const used = b.credit_limit > 0 ? Math.max(0, b.balance) / b.credit_limit : 0
            return (
              <motion.div key={b.party_id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.025, 0.4) }}>
                <Link to={`/app/parties/${b.party_id}`} className="card card-hover block p-4">
                  <div className="flex items-start gap-3">
                    <span className={`grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-sm font-bold text-white shadow ${COLORS[b.name.length % COLORS.length]}`}>{initials(b.name)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{b.name}</p>
                      <p className="truncate text-xs text-ink-soft">{[b.category, b.city].filter(Boolean).join(' · ') || '—'}</p>
                    </div>
                    {b.phone && <a href={`tel:${phoneLink(b.phone)}`} onClick={(e) => e.stopPropagation()} className="grid size-8 place-items-center rounded-xl bg-leaf-50 text-leaf-600 hover:bg-leaf-100" aria-label="Call"><Phone className="size-4" /></a>}
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-2">
                    <div>
                      <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-mute">{owes > 0.5 ? (tab === 'customer' ? 'Owes us' : 'We owe') : owes < -0.5 ? 'Advance' : 'Settled'}</p>
                      <p className={`num font-display text-xl font-semibold ${owes > 0.5 ? (tab === 'customer' ? 'text-ember-600' : 'text-teak-700') : 'text-leaf-600'}`}>{rupees(Math.abs(owes))}</p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1">
                      {b.overdue > 0 && <Chip tone="red">{rupees(b.overdue)} overdue</Chip>}
                      {tab === 'carpenter' && <Chip tone="brown">{b.commission_pct}% · earned {rupees(b.commission_earned)}</Chip>}
                      {b.last_receipt && tab === 'customer' && <Chip>paid {dateShort(b.last_receipt)}</Chip>}
                    </div>
                  </div>
                  {tab === 'customer' && b.credit_limit > 0 && (
                    <div className="mt-3">
                      <Meter value={Math.max(0, b.balance)} max={b.credit_limit} tone={used > 0.9 ? 'ember' : used > 0.6 ? 'sun' : 'leaf'} />
                      <p className="mt-1 text-[11px] font-semibold text-ink-soft">{Math.round(used * 100)}% of {rupees(b.credit_limit)} credit · {b.credit_days} days</p>
                    </div>
                  )}
                </Link>
              </motion.div>
            )
          })}
        </div>
      )}
      <PartyForm open={form} kind={tab} onClose={() => setForm(false)} />
    </div>
  )
}
