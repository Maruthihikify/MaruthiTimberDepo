import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, HandCoins, MessageCircle, Pencil, Phone, Plus, Printer, Send } from 'lucide-react'
import { rpc } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { addDays, date, fyStart, phoneLink, rupees, rupees2, todayIST, whatsappLink, STATES } from '../../lib/format'
import { useBalances, useParties, useSettings } from '../data'
import { Chip, Empty } from '../../components/ui'
import { PageLoader } from '../../components/Loader'
import { PartyForm } from '../forms/PartyForm'
import { PaymentModal } from '../forms/PaymentModal'
import type { Party } from '../types'

interface Ledger { opening: number; closing: number; rows: { date: string; ref: string; kind: string; narration: string; debit: number; credit: number; balance: number; doc_id: string }[] }

export default function PartyView() {
  const { id } = useParams()
  const nav = useNavigate()
  const { can } = useAuth()
  const parties = useParties()
  const balances = useBalances()
  const settings = useSettings()
  const [from, setFrom] = useState(fyStart())
  const [to, setTo] = useState(todayIST())
  const [edit, setEdit] = useState(false)
  const [pay, setPay] = useState<null | 'in' | 'out'>(null)
  const party = (parties.data ?? []).find((p) => p.id === id) as Party | undefined
  const bal = (balances.data ?? []).find((b) => b.party_id === id)
  const ledger = useQuery({
    queryKey: ['party', id, from, to],
    queryFn: () => rpc<Ledger>('party_ledger', { p_party: id, p_from: from, p_to: to }),
  })
  if (parties.isLoading) return <PageLoader />
  if (!party) return <Empty title="Party not found" />
  const balance = bal?.balance ?? 0
  const reminder = `Namaskara ${party.name},\nThis is a gentle reminder from ${settings.data?.name ?? 'Maruthi Timber Depot'}. Your balance is ${rupees(balance)}${bal?.overdue ? ` (${rupees(bal.overdue)} overdue)` : ''}.${settings.data?.upi_id ? `\nUPI: ${settings.data.upi_id}` : ''}\nThank you!`

  const docLink = (r: Ledger['rows'][number]) => r.kind === 'invoice' || r.kind === 'credit_note' || r.kind === 'commission' ? `/app/sales/${r.doc_id}` : r.kind === 'purchase' ? `/app/purchases/${r.doc_id}` : null

  return (
    <div>
      <div className="no-print mb-5 flex flex-wrap items-center gap-2">
        <button className="btn-ghost" onClick={() => nav(-1)}><ArrowLeft className="size-4" /> Back</button>
        <div className="mr-auto" />
        {party.phone && <a className="btn-ghost" href={`tel:${phoneLink(party.phone)}`}><Phone className="size-4" /> Call</a>}
        {party.phone && balance > 0 && <a className="btn-ghost" target="_blank" rel="noreferrer" href={whatsappLink(party.phone, reminder)}><MessageCircle className="size-4 text-leaf-500" /> Reminder</a>}
        <button className="btn-ghost" onClick={() => window.print()}><Printer className="size-4" /> Statement</button>
        <button className="btn-ghost" onClick={() => setEdit(true)}><Pencil className="size-4" /> Edit</button>
        {party.is_customer && can('manager', 'accounts', 'sales') && <Link className="btn-soft" to={`/app/sales/new?customer=${party.id}`}><Plus className="size-4" /> Bill</Link>}
        {party.is_customer && can('manager', 'accounts', 'sales') && <button className="btn-leaf" onClick={() => setPay('in')}><HandCoins className="size-4" /> Receive</button>}
        {(party.is_supplier || party.is_carpenter) && can('manager', 'accounts') && <button className="btn-primary" onClick={() => setPay('out')}><Send className="size-4" /> Pay</button>}
      </div>

      <section className="card mb-5 overflow-hidden">
        <div className="grid gap-4 p-5 sm:grid-cols-[1fr_auto]">
          <div>
            <h1 className="font-display text-2xl font-semibold">{party.name}</h1>
            <p className="text-sm text-ink-soft">{[party.category, party.city, party.phone].filter(Boolean).join(' · ')}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {party.is_customer && <Chip tone="brown">Customer</Chip>}{party.is_supplier && <Chip tone="green">Supplier</Chip>}{party.is_carpenter && <Chip tone="plum">Carpenter · {party.commission_pct}%</Chip>}
              {party.gstin ? <Chip tone="blue">GSTIN {party.gstin}</Chip> : <Chip>No GSTIN</Chip>}
              <Chip>{STATES[party.state_code] ?? party.state_code}</Chip>
              {party.is_customer && <Chip>{party.credit_limit > 0 ? `Credit ${rupees(party.credit_limit)} · ${party.credit_days} days` : 'Cash only'}</Chip>}
            </div>
            {party.address && <p className="mt-2 text-sm text-ink-soft">{party.address}</p>}
          </div>
          <div className="rounded-2xl bg-cream/70 p-4 text-right">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-mute">{balance > 0.5 ? 'They owe us' : balance < -0.5 ? 'We owe them' : 'Settled'}</p>
            <p className={`num font-display text-3xl font-semibold ${balance > 0.5 ? 'text-ember-600' : balance < -0.5 ? 'text-teak-700' : 'text-leaf-600'}`}>{rupees(Math.abs(balance))}</p>
            {bal?.overdue ? <p className="text-xs font-bold text-ember-600">{rupees(bal.overdue)} overdue</p> : null}
          </div>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="no-print flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
          <h3 className="mr-auto font-display text-lg font-semibold">Account statement</h3>
          {[['FY', fyStart()], ['90 days', addDays(todayIST(), -89)], ['30 days', addDays(todayIST(), -29)]].map(([l, f]) => (
            <button key={l} onClick={() => { setFrom(f); setTo(todayIST()) }} className={`rounded-lg px-2.5 py-1 text-xs font-bold ${from === f ? 'bg-teak-500 text-white' : 'bg-cream text-ink-soft'}`}>{l}</button>
          ))}
          <input type="date" className="input input-sm w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" className="input input-sm w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="hidden px-5 pt-4 print:block">
          <p className="font-display text-xl font-semibold">{settings.data?.name} — Statement of account</p>
          <p className="text-sm">{party.name} · {date(from)} to {date(to)}</p>
        </div>
        {ledger.isLoading ? <div className="skeleton m-4 h-40" /> : ledger.data && (
          <div className="overflow-x-auto">
            <table className="table-x">
              <thead><tr><th>Date</th><th>Ref</th><th>Details</th><th className="text-right">Debit</th><th className="text-right">Credit</th><th className="text-right">Balance</th></tr></thead>
              <tbody>
                <tr className="bg-cream/40"><td>{date(from)}</td><td /><td className="font-semibold">Opening balance</td><td /><td /><td className="text-right"><Bal v={ledger.data.opening} /></td></tr>
                {ledger.data.rows.map((r, i) => {
                  const to2 = docLink(r)
                  return (
                    <tr key={i}>
                      <td className="whitespace-nowrap text-ink-soft">{date(r.date)}</td>
                      <td className="whitespace-nowrap font-semibold">{to2 ? <Link to={to2} className="text-teak-700 hover:underline">{r.ref}</Link> : r.ref}</td>
                      <td className="text-ink-soft">{r.narration}</td>
                      <td className="num text-right">{r.debit ? rupees2(r.debit) : ''}</td>
                      <td className="num text-right">{r.credit ? rupees2(r.credit) : ''}</td>
                      <td className="text-right"><Bal v={r.balance} /></td>
                    </tr>
                  )
                })}
                <tr className="bg-cream/60 font-bold"><td colSpan={5}>Closing balance</td><td className="text-right"><Bal v={ledger.data.closing} /></td></tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="px-5 py-3 text-xs text-ink-mute">Debit = they owe more (bills, payments we made to them). Credit = they owe less (receipts, returns, purchases from them, commission earned). Dr balance means they owe us.</p>
      </section>

      <PartyForm open={edit} party={party} onClose={() => setEdit(false)} />
      <PaymentModal open={!!pay} onClose={() => { setPay(null); void ledger.refetch() }} direction={pay ?? 'in'} partyId={party.id} purpose={pay === 'out' ? (party.is_carpenter && !party.is_supplier ? 'commission' : 'purchase') : 'sale'} />
    </div>
  )
}

function Bal({ v }: { v: number }) {
  return <span className="num whitespace-nowrap font-semibold">{rupees2(Math.abs(v))} <span className="text-[10px] font-bold text-ink-mute">{v > 0.004 ? 'Dr' : v < -0.004 ? 'Cr' : ''}</span></span>
}
