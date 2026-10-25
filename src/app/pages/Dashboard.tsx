import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import { motion } from 'motion/react'
import {
  AlertTriangle, ArrowRight, BadgeIndianRupee, Banknote, Cog, FileClock, HandCoins, Layers, MessageSquareText, PackageOpen,
  Plus, ReceiptIndianRupee, TreePine, Truck, Wallet,
} from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { useDashboard } from '../data'
import { Stat, Section, Chip, Money, Empty } from '../../components/ui'
import { BarRows, Gauge, TrendChart } from '../../components/Charts'
import { date, dateShort, fmt, rupees, rupeesShort, todayIST } from '../../lib/format'
import { plankUrl, plankUrlPersisted, toneFor, SPECIES_TONES } from '../../lib/wood'

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()))
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default function Dashboard() {
  const { profile, can } = useAuth()
  const nav = useNavigate()
  const { data: d, isLoading, error } = useDashboard()
  const money = can('manager', 'accounts')
  const banner = useMemo(() => plankUrlPersisted('dash-banner', { ...SPECIES_TONES.teak, seed: 4, figure: 0.65 }, 1400, 260), [])
  const swatches = useMemo(() => new Map((d?.species ?? []).map((s) => [s.name, plankUrl(toneFor(s.name, s.color, s.grain, 3), 160, 24)])), [d?.species])

  if (error) return <Empty title="Could not load the dashboard" body={(error as Error).message} />

  const margin = d?.month.taxable ? ((d.month.gross_profit ?? 0) / d.month.taxable) * 100 : 0
  const alerts = [
    d?.low_stock.length ? { icon: PackageOpen, tone: 'text-ember-600 bg-ember-50', text: `${d.low_stock.length} item${d.low_stock.length > 1 ? 's' : ''} below minimum stock`, to: '/app/stock?low=1' } : null,
    d && d.deliveries.pending + d.deliveries.dispatched > 0 ? { icon: Truck, tone: 'text-sky-600 bg-sky-50', text: `${d.deliveries.pending} to dispatch · ${d.deliveries.dispatched} on the road`, to: '/app/deliveries' } : null,
    d?.enquiries_new ? { icon: MessageSquareText, tone: 'text-plum-500 bg-plum-100', text: `${d.enquiries_new} new website enquir${d.enquiries_new > 1 ? 'ies' : 'y'}`, to: '/app/enquiries' } : null,
    d?.cheques_pending?.count ? { icon: FileClock, tone: 'text-sun-500 bg-sun-100', text: `${d.cheques_pending.count} cheque${d.cheques_pending.count > 1 ? 's' : ''} to clear · ${rupees(d.cheques_pending.amount)}`, to: '/app/payments?tab=cheques' } : null,
    d?.overdue ? { icon: AlertTriangle, tone: 'text-ember-600 bg-ember-50', text: `${rupees(d.overdue)} overdue from customers`, to: '/app/reports?tab=ageing' } : null,
    d?.quotations_open.count ? { icon: ReceiptIndianRupee, tone: 'text-teak-700 bg-teak-50', text: `${d.quotations_open.count} open quotation${d.quotations_open.count > 1 ? 's' : ''} worth ${rupeesShort(d.quotations_open.value)}`, to: '/app/sales?tab=quotation' } : null,
  ].filter(Boolean) as { icon: typeof Truck; tone: string; text: string; to: string }[]

  return (
    <div className="space-y-5">
      {/* sunlit timber banner */}
      <motion.section initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
        className="relative overflow-hidden rounded-3xl shadow-lift" style={{ backgroundImage: `url(${banner})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
        <div className="absolute inset-0 bg-gradient-to-r from-[#5E361B]/80 via-[#8A5530]/45 to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(700px_260px_at_85%_0%,rgba(255,222,160,0.65),transparent_70%)]" />
        <motion.div className="pointer-events-none absolute -inset-y-10 -left-1/3 w-1/3 rotate-12 bg-gradient-to-r from-transparent via-white/25 to-transparent"
          animate={{ x: ['0%', '480%'] }} transition={{ duration: 3.2, delay: 0.6, ease: 'easeInOut', repeat: Infinity, repeatDelay: 9 }} />
        <div className="relative flex flex-col gap-4 p-5 sm:p-7 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-teak-100">{date(todayIST())}</p>
            <h1 className="mt-1 font-display text-[28px] font-semibold leading-tight text-white drop-shadow sm:text-4xl">{greeting()}, {profile?.full_name.split(' ')[0]}</h1>
            <p className="mt-1.5 max-w-xl text-sm font-medium text-teak-50/95">
              {d ? <>Yard holds <b>{fmt(d.stock.sawn_cft, 0)} CFT</b> sawn timber and <b>{d.stock.logs} logs</b> ({fmt(d.stock.log_cft, 0)} CFT) · {d.today.bills} bill{d.today.bills === 1 ? '' : 's'} today</> : 'Loading the yard…'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {can('manager', 'accounts', 'sales') && <Link to="/app/sales/new" className="btn bg-white text-teak-800 shadow-lg hover:bg-teak-50"><Plus className="size-4" /> New bill</Link>}
            {can('manager', 'yard') && <Link to="/app/sawmill/new" className="btn bg-white/15 text-white ring-1 ring-white/40 backdrop-blur hover:bg-white/25"><Cog className="size-4" /> Saw logs</Link>}
            {can('manager', 'accounts', 'sales') && <Link to="/app/payments?new=in" className="btn bg-white/15 text-white ring-1 ring-white/40 backdrop-blur hover:bg-white/25"><HandCoins className="size-4" /> Receive money</Link>}
          </div>
        </div>
      </motion.section>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sales today" value={d?.today.sales ?? 0} format={rupees} icon={<BadgeIndianRupee className="size-4" />} tone="teak" delay={0.05}
          hint={d ? `${d.today.bills} bills · ${fmt(d.today.cft_sold, 1)} CFT` : ' '} onClick={() => nav('/app/sales')} />
        <Stat label="Collected today" value={d?.today.collections ?? 0} format={rupees} icon={<Wallet className="size-4" />} tone="leaf" delay={0.1}
          hint={d ? `Month ${rupeesShort(d.month.collections)}` : ' '} onClick={() => nav('/app/payments')} />
        <Stat label="To collect" value={d?.receivable ?? 0} format={rupeesShort} icon={<Banknote className="size-4" />} tone="ember" delay={0.15}
          hint={d?.overdue ? <span className="text-ember-600">{rupeesShort(d.overdue)} overdue</span> : 'Nothing overdue'} onClick={() => nav('/app/reports?tab=ageing')} />
        <Stat label="Sawn stock" value={d?.stock.sawn_cft ?? 0} format={(n) => `${fmt(n, 0)} CFT`} icon={<Layers className="size-4" />} tone="sky" delay={0.2}
          hint={d ? (money && d.stock.sawn_value !== null ? `Worth ${rupeesShort((d.stock.sawn_value ?? 0) + (d.stock.log_value ?? 0) + (d.stock.other_value ?? 0))} at cost` : `${d.stock.logs} logs waiting`) : ' '} onClick={() => nav('/app/stock')} />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Section className="xl:col-span-2" title="Sales & collections · last 30 days"
          action={<span className="flex items-center gap-3 text-xs font-semibold text-ink-soft"><span className="flex items-center gap-1"><span className="h-1 w-4 rounded bg-teak-500" />Sales</span><span className="flex items-center gap-1"><span className="h-0.5 w-4 border-t-2 border-dashed border-leaf-400" />Collected</span></span>}
          bodyClass="p-3 sm:p-5">
          {isLoading ? <div className="skeleton h-56" /> : <TrendChart data={d?.trend ?? []} />}
          {d && (
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-4 sm:grid-cols-4">
              <Mini label="This month" value={rupeesShort(d.month.sales)} />
              <Mini label="CFT sold" value={fmt(d.month.cft_sold, 1)} />
              {money && <Mini label="Gross profit" value={rupeesShort(d.month.gross_profit ?? 0)} sub={`${fmt(margin, 1)}% margin`} good />}
              {money && <Mini label="Expenses" value={rupeesShort(d.month.expenses ?? 0)} />}
            </div>
          )}
        </Section>

        <Section title="Yard by species" action={<Link to="/app/stock" className="text-xs font-bold text-teak-600 hover:underline">Open stock</Link>} bodyClass="p-4 sm:p-5">
          {isLoading ? <div className="space-y-3">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-8" />)}</div> :
            d?.species.length ? (
              <BarRows rows={d.species.slice(0, 8).map((s) => ({ label: s.name, value: Number(s.sawn_cft) + Number(s.log_cft), color: s.color, swatch: swatches.get(s.name), sub: Number(s.log_cft) > 0 ? `(${fmt(s.log_cft, 0)} in logs)` : undefined }))} format={(n) => `${fmt(n, 0)} CFT`} />
            ) : <Empty icon={<TreePine className="size-6" />} title="Yard is empty" body="Record a purchase to bring timber in." />}
        </Section>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Section title="Sawmill · last 30 days" action={<Link to="/app/sawmill" className="text-xs font-bold text-teak-600 hover:underline">Runs</Link>} bodyClass="p-4 sm:p-5">
          <Gauge value={Number(d?.sawmill.yield_pct ?? 0)} label="Recovery on Hoppus CFT" />
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <Mini label="Runs" value={String(d?.sawmill.runs ?? 0)} />
            <Mini label="Logs in" value={`${fmt(d?.sawmill.input_cft ?? 0, 0)}`} sub="CFT" />
            <Mini label="Sawn out" value={`${fmt(d?.sawmill.output_cft ?? 0, 0)}`} sub="CFT" />
          </div>
        </Section>

        <Section title="Needs attention" bodyClass="p-3">
          {alerts.length === 0 ? <Empty icon={<TreePine className="size-6" />} title="All calm in the yard" body="No alerts right now." /> : (
            <ul className="space-y-1.5">
              {alerts.map((a, i) => (
                <motion.li key={a.text} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.06 }}>
                  <Link to={a.to} className="group flex items-center gap-3 rounded-2xl px-2.5 py-2.5 hover:bg-teak-50">
                    <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${a.tone}`}><a.icon className="size-4.5" /></span>
                    <span className="flex-1 text-sm font-semibold text-ink">{a.text}</span>
                    <ArrowRight className="size-4 text-ink-mute transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </motion.li>
              ))}
            </ul>
          )}
          {!!d?.low_stock.length && (
            <div className="mt-2 border-t border-line px-2.5 pt-3">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-mute">Running low</p>
              <div className="flex flex-wrap gap-1.5">
                {d.low_stock.slice(0, 6).map((l) => <Chip key={l.id} tone="red">{l.name}: {fmt(l.have, 1)} / {fmt(l.min, 0)} {l.unit}</Chip>)}
              </div>
            </div>
          )}
        </Section>

        <Section title="Top customers this month" bodyClass="p-4">
          {d?.top_customers.length ? (
            <ol className="space-y-3">
              {d.top_customers.map((c, i) => (
                <li key={c.name} className="flex items-center gap-3">
                  <span className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold ${['bg-sun-100 text-sun-500', 'bg-cream text-ink-soft', 'bg-teak-100 text-teak-700'][i] ?? 'bg-cream text-ink-mute'}`}>{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{c.name}</span>
                    <span className="text-xs text-ink-soft">{c.bills} bill{c.bills > 1 ? 's' : ''}</span>
                  </span>
                  <Money value={c.total} strong />
                </li>
              ))}
            </ol>
          ) : <Empty title="No sales yet this month" />}
        </Section>
      </div>

      <Section title="Latest bills" action={<Link to="/app/sales" className="text-xs font-bold text-teak-600 hover:underline">All bills</Link>}>
        {d?.recent.length ? (
          <div className="divide-y divide-line/70">
            {d.recent.map((r) => (
              <Link key={r.id} to={`/app/sales/${r.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-teak-50/60 sm:px-5">
                <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${r.type === 'invoice' ? 'bg-teak-50 text-teak-600' : r.type === 'quotation' ? 'bg-sky-50 text-sky-600' : 'bg-plum-100 text-plum-500'}`}>
                  <ReceiptIndianRupee className="size-4.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{r.name}</span>
                  <span className="text-xs text-ink-soft">{r.doc_no} · {dateShort(r.date)}</span>
                </span>
                <span className="text-right">
                  <Money value={r.total} strong className="block text-sm" />
                  {r.status === 'cancelled' ? <Chip tone="red">Cancelled</Chip> : r.type === 'invoice' ? (r.total - r.paid > 0.5 ? <Chip tone="amber">Due {rupees(r.total - r.paid)}</Chip> : <Chip tone="green">Paid</Chip>) : <Chip tone={r.type === 'quotation' ? 'blue' : 'plum'}>{r.type === 'quotation' ? 'Quotation' : 'Return'}</Chip>}
                </span>
              </Link>
            ))}
          </div>
        ) : <Empty title="No bills yet" />}
      </Section>
    </div>
  )
}

function Mini({ label, value, sub, good }: { label: string; value: string; sub?: string; good?: boolean }) {
  return (
    <div>
      <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-mute">{label}</p>
      <p className={`num font-display text-lg font-semibold ${good ? 'text-leaf-600' : 'text-ink'}`}>{value}</p>
      {sub && <p className="text-[11px] font-semibold text-ink-soft">{sub}</p>}
    </div>
  )
}
