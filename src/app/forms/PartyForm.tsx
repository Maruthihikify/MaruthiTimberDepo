import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Modal, Field } from '../../components/ui'
import { RingSpinner } from '../../components/Loader'
import { toast } from '../../components/Toast'
import { must, supabase } from '../../lib/supabase'
import { GSTIN_RE, STATES } from '../../lib/format'
import { useAuth } from '../../lib/auth'
import type { Party } from '../types'

type Kind = 'customer' | 'supplier' | 'carpenter'

const blank = (kind: Kind, name = ''): Partial<Party> => ({
  name,
  is_customer: kind === 'customer',
  is_supplier: kind === 'supplier',
  is_carpenter: kind === 'carpenter',
  state_code: '29',
  credit_limit: 0,
  credit_days: kind === 'customer' ? 0 : 30,
  opening_balance: 0,
  commission_pct: kind === 'carpenter' ? 2 : 0,
})

export function PartyForm({ open, onClose, kind = 'customer', party, initialName, onSaved }: {
  open: boolean; onClose: () => void; kind?: Kind; party?: Party | null; initialName?: string; onSaved?: (p: Party) => void
}) {
  const qc = useQueryClient()
  const { can } = useAuth()
  const [f, setF] = useState<Partial<Party>>(blank(kind))
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) setF(party ? { ...party } : blank(kind, initialName ?? '')) }, [open, party, kind, initialName])
  const set = <K extends keyof Party>(k: K, v: Party[K]) => setF((s) => ({ ...s, [k]: v }))

  const gstinBad = !!f.gstin && !GSTIN_RE.test(f.gstin)
  const phoneBad = !!f.phone && !/^[6-9]\d{9}$/.test(f.phone.replace(/\D/g, '').slice(-10))

  async function save() {
    if (!f.name?.trim()) return toast.error('Enter the name')
    if (gstinBad) return toast.error('GSTIN looks wrong', 'Format: 29ABCDE1234F1Z5')
    setBusy(true)
    try {
      const row = {
        name: f.name.trim(), is_customer: !!f.is_customer, is_supplier: !!f.is_supplier, is_carpenter: !!f.is_carpenter,
        category: f.category?.trim() || null, phone: f.phone?.replace(/\D/g, '').slice(-10) || null, alt_phone: f.alt_phone || null,
        email: f.email?.trim() || null, gstin: f.gstin?.trim().toUpperCase() || null,
        state_code: f.gstin && GSTIN_RE.test(f.gstin) ? f.gstin.slice(0, 2) : f.state_code ?? '29',
        address: f.address?.trim() || null, city: f.city?.trim() || null, pincode: f.pincode || null,
        credit_limit: Number(f.credit_limit) || 0, credit_days: Number(f.credit_days) || 0,
        opening_balance: Number(f.opening_balance) || 0, commission_pct: Number(f.commission_pct) || 0, notes: f.notes || null,
      }
      const saved = party
        ? must(await supabase.from('parties').update(row).eq('id', party.id).select().single())
        : must(await supabase.from('parties').insert(row).select().single())
      await qc.invalidateQueries({ queryKey: ['parties'] })
      await qc.invalidateQueries({ queryKey: ['balances'] })
      toast.success(party ? 'Saved' : `${row.name} added`)
      onSaved?.(saved as unknown as Party)
      onClose()
    } catch (e) {
      toast.error('Could not save', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const manager = can('manager', 'accounts')
  return (
    <Modal open={open} onClose={onClose} wide title={party ? `Edit ${party.name}` : `New ${kind === 'carpenter' ? 'carpenter / mestri' : kind}`}
      footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save} disabled={busy}>{busy && <RingSpinner size={16} />} Save</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name *" className="sm:col-span-2"><input className="input" value={f.name ?? ''} onChange={(e) => set('name', e.target.value)} autoFocus /></Field>
        <Field label="Mobile" hint={phoneBad ? <span className="text-ember-600">10-digit mobile number</span> : undefined}>
          <input className="input" inputMode="tel" value={f.phone ?? ''} onChange={(e) => set('phone', e.target.value)} placeholder="98xxxxxxxx" />
        </Field>
        <Field label="Type / category"><input className="input" list="party-cats" value={f.category ?? ''} onChange={(e) => set('category', e.target.value)} placeholder="Builder, Contractor, Home owner…" /></Field>
        <datalist id="party-cats">{['Builder', 'Contractor', 'Home owner', 'Interior designer', 'Furniture maker', 'Carpenter / mestri', 'Importer', 'Mill', 'Forest auction', 'Distributor', 'Door maker'].map((c) => <option key={c} value={c} />)}</datalist>
        <Field label="GSTIN" hint={gstinBad ? <span className="text-ember-600">Format: 29ABCDE1234F1Z5</span> : 'Needed for B2B GST bills'}>
          <input className="input uppercase placeholder:normal-case" value={f.gstin ?? ''} onChange={(e) => set('gstin', e.target.value.toUpperCase())} maxLength={15} />
        </Field>
        <Field label="State (place of supply)">
          <select className="input" value={f.gstin && GSTIN_RE.test(f.gstin) ? f.gstin.slice(0, 2) : f.state_code} disabled={!!f.gstin && GSTIN_RE.test(f.gstin)} onChange={(e) => set('state_code', e.target.value)}>
            {Object.entries(STATES).map(([c, n]) => <option key={c} value={c}>{c} · {n}</option>)}
          </select>
        </Field>
        <Field label="Address" className="sm:col-span-2"><textarea className="input min-h-16" value={f.address ?? ''} onChange={(e) => set('address', e.target.value)} /></Field>
        <Field label="City / town"><input className="input" value={f.city ?? ''} onChange={(e) => set('city', e.target.value)} /></Field>
        <Field label="E-mail"><input className="input" type="email" value={f.email ?? ''} onChange={(e) => set('email', e.target.value)} /></Field>
        <div className="sm:col-span-2 flex flex-wrap gap-4 rounded-2xl bg-cream/60 p-3 text-sm font-semibold">
          <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-teak-500" checked={!!f.is_customer} onChange={(e) => set('is_customer', e.target.checked)} /> Customer</label>
          <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-teak-500" checked={!!f.is_supplier} onChange={(e) => set('is_supplier', e.target.checked)} /> Supplier</label>
          <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-teak-500" checked={!!f.is_carpenter} onChange={(e) => set('is_carpenter', e.target.checked)} /> Carpenter / mestri (earns commission)</label>
        </div>
        {f.is_customer && (
          <>
            <Field label="Credit limit (₹)" hint={manager ? '0 = cash only. Bills above the limit need the owner or manager.' : 'Only the manager can change credit terms'}>
              <input className="input num" type="number" min={0} step={1000} value={f.credit_limit ?? 0} disabled={!manager} onChange={(e) => set('credit_limit', Number(e.target.value))} />
            </Field>
            <Field label="Credit days"><input className="input num" type="number" min={0} value={f.credit_days ?? 0} disabled={!manager} onChange={(e) => set('credit_days', Number(e.target.value))} /></Field>
          </>
        )}
        {f.is_carpenter && (
          <Field label="Commission %" hint="On the taxable value of bills they refer"><input className="input num" type="number" min={0} max={20} step={0.5} value={f.commission_pct ?? 0} onChange={(e) => set('commission_pct', Number(e.target.value))} /></Field>
        )}
        {!party && manager && (
          <Field label="Opening balance (₹)" hint="+ they owe us · − we owe them"><input className="input num" type="number" value={f.opening_balance ?? 0} onChange={(e) => set('opening_balance', Number(e.target.value))} /></Field>
        )}
        <Field label="Notes" className="sm:col-span-2"><input className="input" value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field>
      </div>
    </Modal>
  )
}
