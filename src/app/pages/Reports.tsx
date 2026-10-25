import { useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ChartColumnBig, Download, Printer } from 'lucide-react'
import { rpc } from '../../lib/supabase'
import { addDays, date, fmt, fyStart, monthStart, rupees, rupees2, todayIST, STATES } from '../../lib/format'
import { useSawnStock, useYardLogs, useProducts } from '../data'
import { Chip, Empty, Money, PageHeader, Tabs } from '../../components/ui'
import { BarRows, Donut } from '../../components/Charts'

type Tab = 'gst' | 'profit' | 'ageing' | 'daybook' | 'commission' | 'stock'

function csv(name: string, rows: (string | number | null | undefined)[][]) {
  const text = rows.map((r) => r.map((v) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }).join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }))
  a.download = `${name}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

export default function Reports() {
  const [sp, setSp] = useSearchParams()
  const tab = (sp.get('tab') as Tab) || 'gst'
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(todayIST())
  const presets: [string, string, string][] = [
    ['This month', monthStart(), todayIST()],
    ['Last month', monthStart(addDays(monthStart(), -1)), addDays(monthStart(), -1)],
    ['90 days', addDays(todayIST(), -89), todayIST()],
    ['This FY', fyStart(), todayIST()],
  ]
  return (
    <div>
      <PageHeader icon={<ChartColumnBig className="size-5" />} title="Reports & GST" subtitle="Numbers your CA and you will want — all exportable" actions={<button className="btn-ghost no-print" onClick={() => window.print()}><Printer className="size-4" /> Print</button>} />
      <div className="no-print mb-4 flex flex-col gap-3">
        <Tabs value={tab} onChange={(v) => setSp({ tab: v })} items={[
          { value: 'gst', label: 'GST (GSTR-1)' }, { value: 'profit', label: 'Profit' }, { value: 'ageing', label: 'Receivables ageing' },
          { value: 'daybook', label: 'Day book' }, { value: 'commission', label: 'Carpenter commission' }, { value: 'stock', label: 'Stock valuation' },
        ]} />
        {!['ageing', 'stock'].includes(tab) && (
          <div className="flex flex-wrap items-center gap-2">
            {presets.map(([l, f, t]) => <button key={l} onClick={() => { setFrom(f); setTo(t) }} className={`rounded-xl px-3 py-1.5 text-xs font-bold ${from === f && to === t ? 'bg-teak-500 text-white shadow-glow' : 'bg-paper text-ink-soft ring-1 ring-line'}`}>{l}</button>)}
            <input type="date" className="input input-sm w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-ink-mute">→</span>
            <input type="date" className="input input-sm w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        )}
      </div>
      <p className="mb-3 hidden text-sm font-semibold print:block">Period: {date(from)} – {date(to)}</p>
      {tab === 'gst' && <Gst from={from} to={to} />}
      {tab === 'profit' && <Profit from={from} to={to} />}
      {tab === 'ageing' && <Ageing />}
      {tab === 'daybook' && <Daybook from={from} to={to} />}
      {tab === 'commission' && <Commission from={from} to={to} />}
      {tab === 'stock' && <StockValuation />}
    </div>
  )
}

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card mb-5 overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5"><h3 className="font-display text-lg font-semibold">{title}</h3>{action}</div>
      {children}
    </section>
  )
}
const Exp = ({ onClick }: { onClick: () => void }) => <button className="btn-soft btn-sm no-print" onClick={onClick}><Download className="size-3.5" /> CSV</button>
function Big({ label, value, tone = 'text-ink' }: { label: string; value: string; tone?: string }) {
  return <div className="card p-4"><p className="text-[11px] font-bold uppercase tracking-wider text-ink-mute">{label}</p><p className={`num font-display text-2xl font-semibold ${tone}`}>{value}</p></div>
}

interface GstData {
  summary: { invoices: number; credit_notes: number; first_no: string | null; last_no: string | null; taxable: number; cgst: number; sgst: number; igst: number; total: number }
  b2b: { doc_no: string; date: string; type: string; gstin: string; name: string; pos: string; taxable: number; cgst: number; sgst: number; igst: number; total: number }[]
  b2c: { rate: number; interstate: boolean; taxable: number; cgst: number; sgst: number; igst: number }[]
  hsn: { hsn: string; rate: number; uqc: string; qty: number; taxable: number; cgst: number; sgst: number; igst: number; value: number }[]
  purchases: { bills: number; taxable: number; cgst: number; sgst: number; igst: number }
}
function Gst({ from, to }: { from: string; to: string }) {
  const q = useQuery({ queryKey: ['reports', 'gst', from, to], queryFn: () => rpc<GstData>('report_gst', { p_from: from, p_to: to }) })
  if (q.isLoading) return <div className="skeleton h-80" />
  if (!q.data) return <Empty title="No data" />
  const d = q.data
  const outTax = Number(d.summary.cgst) + Number(d.summary.sgst) + Number(d.summary.igst)
  const inTax = Number(d.purchases.cgst) + Number(d.purchases.sgst) + Number(d.purchases.igst)
  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Big label="Taxable sales" value={rupees(d.summary.taxable)} />
        <Big label="Output GST" value={rupees(outTax)} tone="text-ember-600" />
        <Big label="Input GST (purchases)" value={rupees(inTax)} tone="text-leaf-600" />
        <Big label="Net GST payable*" value={rupees(Math.max(0, outTax - inTax))} tone="text-teak-700" />
      </div>
      <p className="-mt-3 mb-5 text-xs text-ink-mute">*Before ITC rules, reverse charge and carried-forward credit — confirm with your CA before filing. {d.summary.invoices} invoices ({d.summary.first_no ?? '—'} to {d.summary.last_no ?? '—'}) and {d.summary.credit_notes} credit notes.</p>
      <Card title="HSN summary (Table 12)" action={<Exp onClick={() => csv(`hsn-${from}-${to}`, [['HSN', 'UQC', 'Qty', 'Rate %', 'Taxable', 'IGST', 'CGST', 'SGST', 'Total value'], ...d.hsn.map((h) => [h.hsn, h.uqc, h.qty, h.rate, h.taxable, h.igst, h.cgst, h.sgst, h.value])])} />}>
        <div className="overflow-x-auto"><table className="table-x"><thead><tr><th>HSN</th><th>UQC</th><th className="text-right">Qty</th><th className="text-right">Rate</th><th className="text-right">Taxable</th><th className="text-right">IGST</th><th className="text-right">CGST</th><th className="text-right">SGST</th></tr></thead>
          <tbody>{d.hsn.map((h) => <tr key={h.hsn + h.rate + h.uqc}><td className="font-bold">{h.hsn}</td><td>{h.uqc}</td><td className="num text-right">{fmt(h.qty, 3)}</td><td className="num text-right">{fmt(h.rate)}%</td><td className="text-right"><Money value={h.taxable} /></td><td className="text-right"><Money value={h.igst} /></td><td className="text-right"><Money value={h.cgst} /></td><td className="text-right"><Money value={h.sgst} /></td></tr>)}</tbody>
        </table></div>
        <p className="px-5 py-2 text-xs text-ink-mute">Timber sold in CFT is reported in cubic metres (UQC CBM = CFT ÷ 35.3147), as GST does not have a CFT unit.</p>
      </Card>
      <Card title={`B2B invoices (${d.b2b.length})`} action={<Exp onClick={() => csv(`b2b-${from}-${to}`, [['GSTIN', 'Name', 'Number', 'Date', 'Type', 'Place of supply', 'Taxable', 'IGST', 'CGST', 'SGST', 'Total'], ...d.b2b.map((b) => [b.gstin, b.name, b.doc_no, b.date, b.type, `${b.pos}-${STATES[b.pos] ?? ''}`, b.taxable, b.igst, b.cgst, b.sgst, b.total])])} />}>
        {!d.b2b.length ? <p className="px-5 py-4 text-sm text-ink-soft">No B2B bills in this period.</p> : (
          <div className="max-h-96 overflow-auto"><table className="table-x"><thead><tr><th>GSTIN</th><th>Customer</th><th>Number</th><th>Date</th><th className="text-right">Taxable</th><th className="text-right">Tax</th><th className="text-right">Total</th></tr></thead>
            <tbody>{d.b2b.map((b) => <tr key={b.doc_no}><td className="font-mono text-xs">{b.gstin}</td><td className="font-semibold">{b.name}</td><td>{b.doc_no}{b.type === 'credit_note' && <Chip tone="plum">CN</Chip>}</td><td className="text-ink-soft">{date(b.date)}</td><td className="text-right"><Money value={b.taxable} /></td><td className="text-right"><Money value={Number(b.igst) + Number(b.cgst) + Number(b.sgst)} /></td><td className="text-right"><Money value={b.total} strong /></td></tr>)}</tbody>
          </table></div>
        )}
      </Card>
      <Card title="B2C (consumers, no GSTIN)" action={<Exp onClick={() => csv(`b2c-${from}-${to}`, [['Rate %', 'Inter-state', 'Taxable', 'IGST', 'CGST', 'SGST'], ...d.b2c.map((b) => [b.rate, b.interstate ? 'Yes' : 'No', b.taxable, b.igst, b.cgst, b.sgst])])} />}>
        <div className="overflow-x-auto"><table className="table-x"><thead><tr><th>Rate</th><th>Supply</th><th className="text-right">Taxable</th><th className="text-right">IGST</th><th className="text-right">CGST</th><th className="text-right">SGST</th></tr></thead>
          <tbody>{d.b2c.map((b, i) => <tr key={i}><td className="font-bold">{fmt(b.rate)}%</td><td>{b.interstate ? 'Inter-state' : 'Intra-state'}</td><td className="text-right"><Money value={b.taxable} /></td><td className="text-right"><Money value={b.igst} /></td><td className="text-right"><Money value={b.cgst} /></td><td className="text-right"><Money value={b.sgst} /></td></tr>)}</tbody>
        </table></div>
      </Card>
    </>
  )
}

interface ProfitData { revenue: number; cogs: number; commission: number; expenses: number; expense_breakup: { category: string; amount: number }[]; by_species: { species: string; color: string; cft: number; revenue: number; cogs: number }[] }
function Profit({ from, to }: { from: string; to: string }) {
  const q = useQuery({ queryKey: ['reports', 'profit', from, to], queryFn: () => rpc<ProfitData>('report_profit', { p_from: from, p_to: to }) })
  if (q.isLoading) return <div className="skeleton h-80" />
  if (!q.data) return <Empty title="No data" />
  const d = q.data
  const gross = Number(d.revenue) - Number(d.cogs)
  const net = gross - Number(d.commission) - Number(d.expenses)
  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Big label="Sales (taxable)" value={rupees(d.revenue)} />
        <Big label="Cost of timber sold" value={rupees(d.cogs)} />
        <Big label="Gross profit" value={`${rupees(gross)}`} tone="text-leaf-600" />
        <Big label="Net after expenses" value={rupees(net)} tone={net >= 0 ? 'text-leaf-600' : 'text-ember-600'} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="By species" action={<Exp onClick={() => csv(`profit-species-${from}-${to}`, [['Species', 'CFT', 'Revenue', 'Cost', 'Profit', 'Margin %'], ...d.by_species.map((s) => [s.species, s.cft, s.revenue, s.cogs, Number(s.revenue) - Number(s.cogs), Number(s.revenue) ? ((Number(s.revenue) - Number(s.cogs)) / Number(s.revenue)) * 100 : 0])])} />}>
          <div className="overflow-x-auto"><table className="table-x"><thead><tr><th>Species</th><th className="text-right">CFT</th><th className="text-right">Sales</th><th className="text-right">Profit</th><th className="text-right">Margin</th></tr></thead>
            <tbody>{d.by_species.map((s) => { const p = Number(s.revenue) - Number(s.cogs); return <tr key={s.species}><td className="font-semibold"><span className="mr-2 inline-block size-2.5 rounded-full" style={{ background: s.color }} />{s.species}</td><td className="num text-right">{fmt(s.cft, 1)}</td><td className="text-right"><Money value={s.revenue} /></td><td className="text-right text-leaf-600"><Money value={p} /></td><td className="num text-right font-bold">{Number(s.revenue) ? fmt((p / Number(s.revenue)) * 100, 1) : 0}%</td></tr> })}</tbody>
          </table></div>
        </Card>
        <Card title="Where the profit went">
          <div className="p-5">
            <Donut parts={[
              { label: 'Kept as net profit', value: Math.max(0, net), color: '#2A8C54' },
              { label: 'Carpenter commission', value: Number(d.commission), color: '#9B4A9E' },
              ...d.expense_breakup.slice(0, 6).map((e, i) => ({ label: e.category, value: Number(e.amount), color: ['#C9762A', '#E39A17', '#2B7FD9', '#E0532E', '#85481B', '#4F9CF0'][i] })),
            ]} center={<div><p className="text-[10px] font-bold uppercase text-ink-mute">Gross</p><p className="num font-display text-base font-semibold">{rupees(gross)}</p></div>} />
          </div>
        </Card>
      </div>
    </>
  )
}

interface AgeRow { party_id: string; name: string; phone: string | null; bills: number; due: number; current: number; d1_30: number; d31_60: number; d61_90: number; d90p: number; oldest_days: number }
function Ageing() {
  const q = useQuery({ queryKey: ['reports', 'ageing'], queryFn: () => rpc<{ as_of: string; totals: Omit<AgeRow, 'party_id' | 'name' | 'phone' | 'bills' | 'oldest_days'>; parties: AgeRow[] }>('report_ageing', {}) })
  if (q.isLoading) return <div className="skeleton h-80" />
  if (!q.data) return <Empty title="No data" />
  const t = q.data.totals
  const buckets = [['Not yet due', t.current, '#45A86D'], ['1–30 days late', t.d1_30, '#F5B83D'], ['31–60', t.d31_60, '#DC9140'], ['61–90', t.d61_90, '#F0744D'], ['90+ days', t.d90p, '#B93E1F']] as const
  return (
    <>
      <div className="card mb-5 p-5"><BarRows rows={buckets.map(([label, value, color]) => ({ label, value: Number(value), color }))} format={(n) => rupees(n)} /></div>
      <Card title={`Who owes what · ${date(q.data.as_of)}`} action={<Exp onClick={() => csv('ageing', [['Customer', 'Phone', 'Bills', 'Total due', 'Not due', '1-30', '31-60', '61-90', '90+'], ...q.data!.parties.map((p) => [p.name, p.phone, p.bills, p.due, p.current, p.d1_30, p.d31_60, p.d61_90, p.d90p])])} />}>
        <div className="overflow-x-auto"><table className="table-x"><thead><tr><th>Customer</th><th className="text-right">Due</th><th className="text-right">Not due</th><th className="text-right">1–30</th><th className="text-right">31–60</th><th className="text-right">61–90</th><th className="text-right">90+</th></tr></thead>
          <tbody>{q.data.parties.map((p) => <tr key={p.party_id ?? p.name}><td>{p.party_id ? <Link className="font-semibold text-teak-700 hover:underline" to={`/app/parties/${p.party_id}`}>{p.name}</Link> : p.name}<span className="ml-2 text-xs text-ink-mute">{p.bills} bills</span></td><td className="text-right"><Money value={p.due} strong /></td>{(['current', 'd1_30', 'd31_60', 'd61_90', 'd90p'] as const).map((k) => <td key={k} className={`text-right ${Number(p[k]) > 0 && k !== 'current' ? 'text-ember-600' : 'text-ink-soft'}`}>{Number(p[k]) ? <Money value={p[k]} /> : '·'}</td>)}</tr>)}</tbody>
        </table></div>
      </Card>
    </>
  )
}

function Daybook({ from, to }: { from: string; to: string }) {
  const q = useQuery({ queryKey: ['reports', 'daybook', from, to], queryFn: () => rpc<{ rows: { d: string; ref: string; party: string; mode: string; narration: string; money_in: number; money_out: number; status: string }[]; by_mode: { mode: string; in: number; out: number }[]; total_in: number; total_out: number }>('report_daybook', { p_from: from, p_to: to }) })
  if (q.isLoading) return <div className="skeleton h-80" />
  if (!q.data) return <Empty title="No data" />
  const d = q.data
  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Big label="Money in" value={rupees(d.total_in)} tone="text-leaf-600" />
        <Big label="Money out" value={rupees(d.total_out)} tone="text-ember-600" />
        {d.by_mode.filter((m) => m.mode === 'cash').map((m) => <Big key="cash" label="Cash in hand change" value={rupees(Number(m.in) - Number(m.out))} />)}
        <Big label="Net" value={rupees(Number(d.total_in) - Number(d.total_out))} />
      </div>
      <Card title="Day book" action={<Exp onClick={() => csv(`daybook-${from}-${to}`, [['Date', 'Ref', 'Party', 'Mode', 'Details', 'In', 'Out'], ...d.rows.map((r) => [r.d, r.ref, r.party, r.mode, r.narration, r.money_in, r.money_out])])} />}>
        <div className="max-h-[560px] overflow-auto"><table className="table-x"><thead><tr><th>Date</th><th>Ref</th><th>Party</th><th>Mode</th><th>Details</th><th className="text-right">In</th><th className="text-right">Out</th></tr></thead>
          <tbody>{d.rows.map((r, i) => <tr key={i}><td className="whitespace-nowrap text-ink-soft">{date(r.d)}</td><td className="font-semibold">{r.ref}</td><td>{r.party}</td><td className="uppercase text-ink-soft">{r.mode}</td><td className="text-ink-soft">{r.narration}{r.status === 'pending' && <Chip tone="amber">cheque pending</Chip>}</td><td className="num text-right text-leaf-600">{Number(r.money_in) ? rupees2(r.money_in) : ''}</td><td className="num text-right text-ember-600">{Number(r.money_out) ? rupees2(r.money_out) : ''}</td></tr>)}</tbody>
        </table></div>
      </Card>
    </>
  )
}

function Commission({ from, to }: { from: string; to: string }) {
  const q = useQuery({ queryKey: ['reports', 'commission', from, to], queryFn: () => rpc<{ party_id: string; name: string; phone: string | null; pct: number; bills: number; business: number; earned: number; paid: number; balance_due: number }[]>('report_commissions', { p_from: from, p_to: to }) })
  if (q.isLoading) return <div className="skeleton h-60" />
  return (
    <Card title="Carpenter / mestri commission" action={<Exp onClick={() => csv(`commission-${from}-${to}`, [['Carpenter', 'Phone', '%', 'Bills', 'Business', 'Earned', 'Paid', 'Balance due (all time)'], ...(q.data ?? []).map((c) => [c.name, c.phone, c.pct, c.bills, c.business, c.earned, c.paid, c.balance_due])])} />}>
      {!q.data?.length ? <Empty title="No carpenters on record" /> : (
        <div className="overflow-x-auto"><table className="table-x"><thead><tr><th>Carpenter</th><th className="text-right">Bills</th><th className="text-right">Business brought</th><th className="text-right">Earned</th><th className="text-right">Paid</th><th className="text-right">To pay now</th></tr></thead>
          <tbody>{q.data.map((c) => <tr key={c.party_id}><td><Link to={`/app/parties/${c.party_id}`} className="font-semibold text-teak-700 hover:underline">{c.name}</Link> <span className="text-xs text-ink-mute">{c.pct}%</span></td><td className="num text-right">{c.bills}</td><td className="text-right"><Money value={c.business} /></td><td className="text-right"><Money value={c.earned} /></td><td className="text-right"><Money value={c.paid} /></td><td className="text-right"><Money value={c.balance_due} strong className={c.balance_due > 0 ? 'text-plum-500' : ''} /></td></tr>)}</tbody>
        </table></div>
      )}
    </Card>
  )
}

function StockValuation() {
  const sawn = useSawnStock()
  const logs = useYardLogs()
  const products = useProducts()
  const bySpecies = new Map<string, { cft: number; value: number; sale: number }>()
  for (const r of sawn.data ?? []) {
    const s = bySpecies.get(r.species_name) ?? { cft: 0, value: 0, sale: 0 }
    s.cft += Number(r.cft); s.value += Number(r.cft) * Number(r.avg_cost); s.sale += Number(r.cft) * Number(r.sale_rate)
    bySpecies.set(r.species_name, s)
  }
  const logVal = (logs.data ?? []).reduce((a, l) => ({ cft: a.cft + Number(l.cft), value: a.value + Number(l.cft) * Number(l.cost_per_cft) }), { cft: 0, value: 0 })
  const items = (products.data ?? []).filter((p) => ['panel', 'unit', 'byproduct'].includes(p.kind) && Number(p.qty_on_hand) > 0)
  const itemVal = items.reduce((a, p) => a + (p.kind === 'panel' ? Number(p.qty_on_hand) * Number(p.sheet_sqft) : Number(p.qty_on_hand)) * Number(p.avg_cost), 0)
  const sawnVal = [...bySpecies.values()].reduce((a, s) => a + s.value, 0)
  const rows = [...bySpecies.entries()].sort((a, b) => b[1].value - a[1].value)
  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Big label="Sawn timber at cost" value={rupees(sawnVal)} />
        <Big label="Logs at cost" value={rupees(logVal.value)} />
        <Big label="Plywood, doors & others" value={rupees(itemVal)} />
        <Big label="Total stock value" value={rupees(sawnVal + logVal.value + itemVal)} tone="text-teak-700" />
      </div>
      <Card title="Sawn timber by species" action={<Exp onClick={() => csv('stock-valuation', [['Species', 'CFT', 'Value at cost', 'Value at list rate'], ...rows.map(([n, s]) => [n, s.cft, s.value, s.sale]), ['Logs (Hoppus)', logVal.cft, logVal.value, ''], ...items.map((p) => [p.name, p.qty_on_hand, (p.kind === 'panel' ? Number(p.qty_on_hand) * Number(p.sheet_sqft) : Number(p.qty_on_hand)) * Number(p.avg_cost), ''])])} />}>
        <div className="overflow-x-auto"><table className="table-x"><thead><tr><th>Species</th><th className="text-right">CFT</th><th className="text-right">At cost</th><th className="text-right">At list rate</th><th className="text-right">Potential margin</th></tr></thead>
          <tbody>{rows.map(([n, s]) => <tr key={n}><td className="font-semibold">{n}</td><td className="num text-right">{fmt(s.cft, 2)}</td><td className="text-right"><Money value={s.value} /></td><td className="text-right"><Money value={s.sale} /></td><td className="text-right text-leaf-600"><Money value={s.sale - s.value} /></td></tr>)}</tbody>
        </table></div>
      </Card>
    </>
  )
}
