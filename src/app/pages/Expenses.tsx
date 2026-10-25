import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Receipt, Trash2 } from 'lucide-react'
import { must, supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { addDays, dateShort, monthStart, rupees, todayIST } from '../../lib/format'
import { Confirm, Empty, Field, Modal, Money, PageHeader, SkeletonRows } from '../../components/ui'
import { BarRows } from '../../components/Charts'
import { RingSpinner } from '../../components/Loader'
import { toast } from '../../components/Toast'
import type { Expense } from '../types'

export const EXPENSE_CATEGORIES = ['Labour wages', 'Salaries', 'Sawmill power', 'Diesel & fuel', 'Blade sharpening & maintenance', 'Transport', 'Loading / hamali', 'Rent', 'Forest permit & fees', 'Office & tea', 'Repairs', 'Bank charges', 'Other']
const COLORS = ['#C9762A', '#45A86D', '#2B7FD9', '#E39A17', '#9B4A9E', '#E0532E', '#85481B', '#1F7044', '#4F9CF0', '#DC9140', '#6D5746', '#F0744D', '#9A8573']

export default function Expenses() {
  const qc = useQueryClient()
  const { can } = useAuth()
  const [from, setFrom] = useState(monthStart())
  const [open, setOpen] = useState(false)
  const [del, setDel] = useState<Expense | null>(null)
  const list = useQuery({
    queryKey: ['reports', 'expenses', from],
    queryFn: async () => must(await supabase.from('expenses').select('*').gte('exp_date', from).order('exp_date', { ascending: false }).order('created_at', { ascending: false })) as Expense[],
  })
  const rows = list.data ?? []
  const byCat = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of rows) m.set(e.category, (m.get(e.category) ?? 0) + Number(e.amount))
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value, color: COLORS[EXPENSE_CATEGORIES.indexOf(label) % COLORS.length] ?? '#9A8573' }))
  }, [rows])
  const total = rows.reduce((a, e) => a + Number(e.amount), 0)

  async function remove() {
    if (!del) return
    const { error } = await supabase.from('expenses').delete().eq('id', del.id)
    if (error) toast.error('Not deleted', error.message)
    else { toast.success('Expense deleted'); void qc.invalidateQueries({ queryKey: ['reports'] }); void qc.invalidateQueries({ queryKey: ['dashboard'] }) }
    setDel(null)
  }

  return (
    <div>
      <PageHeader icon={<Receipt className="size-5" />} title="Expenses" subtitle="Wages, power, diesel, blade sharpening, rent — what it costs to run the yard"
        actions={<button className="btn-primary" onClick={() => setOpen(true)}><Plus className="size-4" /> Add expense</button>} />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {[['This month', monthStart()], ['30 days', addDays(todayIST(), -29)], ['90 days', addDays(todayIST(), -89)]].map(([l, f]) => (
          <button key={l} onClick={() => setFrom(f)} className={`rounded-xl px-3 py-1.5 text-xs font-bold ${from === f ? 'bg-teak-500 text-white shadow-glow' : 'bg-paper text-ink-soft ring-1 ring-line'}`}>{l}</button>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="card overflow-hidden">
          {list.isLoading ? <SkeletonRows /> : !rows.length ? <Empty icon={<Receipt className="size-7" />} title="No expenses in this period" /> : (
            <ul className="divide-y divide-line/70">
              {rows.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: COLORS[EXPENSE_CATEGORIES.indexOf(e.category) % COLORS.length] ?? '#9A8573' }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{e.category}{e.paid_to ? <span className="font-normal text-ink-soft"> · {e.paid_to}</span> : null}</span>
                    <span className="block truncate text-xs text-ink-soft">{dateShort(e.exp_date)} · {e.mode.toUpperCase()}{e.notes ? ` · ${e.notes}` : ''}</span>
                  </span>
                  <Money value={e.amount} strong />
                  {can('manager') && <button className="grid size-8 place-items-center rounded-lg text-ink-mute hover:bg-ember-50 hover:text-ember-600" onClick={() => setDel(e)} aria-label="Delete"><Trash2 className="size-4" /></button>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card h-fit p-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-ink-mute">Total</p>
          <p className="num mb-4 font-display text-3xl font-semibold">{rupees(total)}</p>
          <BarRows rows={byCat} format={(n) => rupees(n)} />
        </div>
      </div>
      <ExpenseModal open={open} onClose={() => setOpen(false)} />
      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={remove} danger title="Delete this expense?" confirmLabel="Delete" body={del ? `${del.category} · ${rupees(del.amount)} on ${dateShort(del.exp_date)}` : ''} />
    </div>
  )
}

function ExpenseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [f, setF] = useState({ exp_date: todayIST(), category: EXPENSE_CATEGORIES[0], amount: '' as number | '', mode: 'cash', paid_to: '', reference: '', notes: '' })
  const [busy, setBusy] = useState(false)
  async function save() {
    if (!(Number(f.amount) > 0)) return toast.error('Enter the amount')
    setBusy(true)
    const { error } = await supabase.from('expenses').insert({ ...f, amount: Number(f.amount), paid_to: f.paid_to || null, reference: f.reference || null, notes: f.notes || null })
    setBusy(false)
    if (error) return toast.error('Not saved', error.message)
    toast.success('Expense saved')
    void qc.invalidateQueries({ queryKey: ['reports'] }); void qc.invalidateQueries({ queryKey: ['dashboard'] })
    setF({ ...f, amount: '', paid_to: '', reference: '', notes: '' })
    onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title="Add expense" footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy} onClick={save}>{busy && <RingSpinner size={16} />} Save</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Category" className="sm:col-span-2">
          <div className="flex flex-wrap gap-1.5">
            {EXPENSE_CATEGORIES.map((c) => <button key={c} type="button" onClick={() => setF({ ...f, category: c })} className={`rounded-lg px-2.5 py-1 text-xs font-bold ${f.category === c ? 'bg-teak-500 text-white' : 'bg-cream text-ink-soft hover:bg-teak-50'}`}>{c}</button>)}
          </div>
        </Field>
        <Field label="Amount ₹"><input className="input num text-lg font-bold" type="number" min={0} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value === '' ? '' : Number(e.target.value) })} autoFocus /></Field>
        <Field label="Date"><input className="input" type="date" max={todayIST()} value={f.exp_date} onChange={(e) => setF({ ...f, exp_date: e.target.value })} /></Field>
        <Field label="Paid by"><select className="input" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}>{['cash', 'upi', 'bank', 'cheque', 'card'].map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}</select></Field>
        <Field label="Paid to"><input className="input" value={f.paid_to} onChange={(e) => setF({ ...f, paid_to: e.target.value })} placeholder="BESCOM, labour, fuel station…" /></Field>
        <Field label="Notes" className="sm:col-span-2"><input className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  )
}
