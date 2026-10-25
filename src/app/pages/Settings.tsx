import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Building2, KeyRound, Plus, Save, Settings as Cog, ShieldCheck, UserRound } from 'lucide-react'
import { must, supabase, errorText } from '../../lib/supabase'
import { useAuth, ROLE_LABEL, STAFF_DOMAIN, type Profile, type Role } from '../../lib/auth'
import { GSTIN_RE, STATES, initials } from '../../lib/format'
import { useSettings } from '../data'
import { Chip, Field, Modal, PageHeader, Tabs } from '../../components/ui'
import { RingSpinner } from '../../components/Loader'
import { toast } from '../../components/Toast'
import type { CompanySettings } from '../types'

type Tab = 'business' | 'billing' | 'website' | 'team'

export default function Settings() {
  const [tab, setTab] = useState<Tab>('business')
  return (
    <div>
      <PageHeader icon={<Cog className="size-5" />} title="Settings" subtitle="Business details printed on bills, billing rules, website and staff logins" />
      <div className="mb-5"><Tabs value={tab} onChange={setTab} items={[{ value: 'business', label: 'Business' }, { value: 'billing', label: 'Billing rules' }, { value: 'website', label: 'Website' }, { value: 'team', label: 'Team & logins' }]} /></div>
      {tab === 'team' ? <Team /> : <CompanyForm tab={tab} />}
    </div>
  )
}

function CompanyForm({ tab }: { tab: Exclude<Tab, 'team'> }) {
  const qc = useQueryClient()
  const s = useSettings()
  const [f, setF] = useState<Partial<CompanySettings>>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (s.data) setF(s.data) }, [s.data])
  const set = <K extends keyof CompanySettings>(k: K, v: CompanySettings[K]) => setF((x) => ({ ...x, [k]: v }))
  async function save() {
    if (f.gstin && !GSTIN_RE.test(f.gstin)) return toast.error('GSTIN looks wrong')
    setBusy(true)
    try {
      const { id: _id, ...rest } = f as CompanySettings
      void _id
      must(await supabase.from('company_settings').update({ ...rest, state_name: STATES[f.state_code ?? '29'] ?? f.state_name, updated_at: new Date().toISOString() }).eq('id', 1).select().single())
      await qc.invalidateQueries({ queryKey: ['settings'] })
      toast.success('Settings saved', 'Bills and the website now use these details.')
    } catch (e) { toast.error('Not saved', (e as Error).message) } finally { setBusy(false) }
  }
  if (s.isLoading) return <div className="skeleton h-96" />
  const txt = (k: keyof CompanySettings, label: string, hint?: string, cls = '') => (
    <Field label={label} hint={hint} className={cls}><input className="input" value={(f[k] as string) ?? ''} onChange={(e) => set(k, e.target.value as never)} /></Field>
  )
  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card p-5">
      <div className="grid gap-4 md:grid-cols-2">
        {tab === 'business' && <>
          {txt('name', 'Business name')}
          {txt('tagline', 'Tagline')}
          <Field label="GSTIN" hint="Printed on every tax invoice"><input className="input uppercase placeholder:normal-case" maxLength={15} value={f.gstin ?? ''} onChange={(e) => set('gstin', e.target.value.toUpperCase())} /></Field>
          {txt('pan', 'PAN')}
          {txt('address', 'Address', undefined, 'md:col-span-2')}
          {txt('city', 'City / town')}
          {txt('pincode', 'PIN code')}
          <Field label="State"><select className="input" value={f.state_code} onChange={(e) => set('state_code', e.target.value)}>{Object.entries(STATES).map(([c, n]) => <option key={c} value={c}>{c} · {n}</option>)}</select></Field>
          {txt('phone', 'Phone')}
          {txt('alt_phone', 'Second phone')}
          {txt('email', 'E-mail')}
          <div className="md:col-span-2 mt-2 border-t border-line pt-4"><p className="font-display text-lg font-semibold">Bank & UPI (printed on bills)</p></div>
          {txt('bank_name', 'Bank')}
          {txt('bank_account', 'Account number')}
          {txt('bank_ifsc', 'IFSC')}
          {txt('upi_id', 'UPI ID', 'e.g. maruthitimber@okaxis')}
        </>}
        {tab === 'billing' && <>
          <Field label="Invoice number prefix" hint="Bills are numbered PREFIX/26-27/0001 each financial year"><input className="input uppercase placeholder:normal-case" maxLength={6} value={f.invoice_prefix ?? ''} onChange={(e) => set('invoice_prefix', e.target.value.toUpperCase())} /></Field>
          <Field label="Quotation valid for (days)"><input className="input num" type="number" min={1} value={f.quotation_validity_days ?? 7} onChange={(e) => set('quotation_validity_days', Number(e.target.value))} /></Field>
          <Field label="Billing counter may discount up to (%)" hint="Bigger discounts need the manager or owner"><input className="input num" type="number" min={0} max={50} value={f.max_sales_discount_pct ?? 10} onChange={(e) => set('max_sales_discount_pct', Number(e.target.value))} /></Field>
          <Field label="Default bark allowance on logs (inches)"><input className="input num" type="number" step={0.5} min={0} value={f.default_bark_allowance_in ?? 0} onChange={(e) => set('default_bark_allowance_in', Number(e.target.value))} /></Field>
          <Field label="Terms printed on bills" className="md:col-span-2"><textarea className="input min-h-32" value={f.invoice_terms ?? ''} onChange={(e) => set('invoice_terms', e.target.value)} /></Field>
        </>}
        {tab === 'website' && <>
          {txt('whatsapp', 'WhatsApp number', 'For the website’s chat button')}
          {txt('opening_hours', 'Opening hours')}
          {txt('map_query', 'Google Maps search text', 'e.g. Maruthi Timber Depot, Kolar — shows the map on the website', 'md:col-span-2')}
          <label className="flex items-center gap-2 text-sm font-semibold md:col-span-2"><input type="checkbox" className="size-4 accent-teak-500" checked={!!f.public_show_prices} onChange={(e) => set('public_show_prices', e.target.checked)} /> Show “rates from ₹…/CFT” on the website</label>
          <p className="text-xs text-ink-mute md:col-span-2">The website shows live availability (In stock / Limited / On order) from your yard. Costs, customers and bills are never shown publicly.</p>
        </>}
      </div>
      <div className="mt-6 flex justify-end"><button className="btn-primary" disabled={busy} onClick={save}>{busy ? <RingSpinner size={16} /> : <Save className="size-4" />} Save</button></div>
    </motion.section>
  )
}

async function callAdmin(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body })
  if (error) {
    let msg = error.message
    try { msg = (await (error as { context?: Response }).context?.json())?.error ?? msg } catch { /* keep message */ }
    throw new Error(msg)
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
  return data
}

function Team() {
  const qc = useQueryClient()
  const { profile: me } = useAuth()
  const staff = useQuery({ queryKey: ['staff'], queryFn: async () => must(await supabase.from('profiles').select('*').order('created_at')) as Profile[] })
  const [add, setAdd] = useState(false)
  const [reset, setReset] = useState<Profile | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: ['staff'] })
  async function act(body: Record<string, unknown>, ok: string) {
    try { await callAdmin(body); toast.success(ok); void refresh() } catch (e) { toast.error('Not done', errorText(e)) }
  }
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-soft">Each person signs in with their own user name or mobile number. Roles decide what they can see and do.</p>
        <button className="btn-primary" onClick={() => setAdd(true)}><Plus className="size-4" /> Add staff</button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {(staff.data ?? []).map((p) => (
          <div key={p.id} className={`card p-4 ${p.active ? '' : 'opacity-60'}`}>
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-teak-300 to-teak-500 font-bold text-white">{initials(p.full_name)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{p.full_name} {p.id === me?.id && <Chip tone="green">you</Chip>}</p>
                <p className="truncate text-xs text-ink-soft">Signs in as <b>{(p.login_email ?? '').replace(`@${STAFF_DOMAIN}`, '')}</b>{p.phone ? ` · ${p.phone}` : ''}</p>
              </div>
              {!p.active && <Chip tone="red">Switched off</Chip>}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select className="input input-sm w-auto" value={p.role} disabled={p.id === me?.id} onChange={(e) => act({ action: 'set_role', user_id: p.id, role: e.target.value }, 'Role updated')}>
                {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
              <button className="btn-ghost btn-sm" onClick={() => setReset(p)}><KeyRound className="size-3.5" /> Reset password</button>
              {p.id !== me?.id && <button className={p.active ? 'btn-danger btn-sm' : 'btn-soft btn-sm'} onClick={() => act({ action: 'set_active', user_id: p.id, active: !p.active }, p.active ? 'Login switched off' : 'Login switched on')}>{p.active ? 'Switch off' : 'Switch on'}</button>}
            </div>
          </div>
        ))}
      </div>
      <div className="card mt-5 p-4 text-sm text-ink-soft">
        <p className="mb-2 flex items-center gap-2 font-bold text-ink"><ShieldCheck className="size-4 text-leaf-500" /> What each role can do</p>
        <ul className="grid gap-1.5 md:grid-cols-2">
          <li><b className="text-ink">Owner</b> — everything, including settings, staff, cancelling bills and overriding credit limits.</li>
          <li><b className="text-ink">Manager</b> — everything except settings & staff; can cancel bills and approve credit.</li>
          <li><b className="text-ink">Accounts</b> — billing, purchases, payments, expenses, reports & GST.</li>
          <li><b className="text-ink">Billing counter</b> — bills, quotations and receipts; cannot see purchase costs; discounts are capped.</li>
          <li><b className="text-ink">Yard & sawmill</b> — stock, logs and saw runs; no money pages.</li>
        </ul>
      </div>
      <AddStaff open={add} onClose={() => setAdd(false)} onDone={refresh} />
      <ResetPassword who={reset} onClose={() => setReset(null)} />
    </div>
  )
}

function AddStaff({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ full_name: '', login: '', phone: '', password: '', role: 'sales' as Role })
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) setF({ full_name: '', login: '', phone: '', password: '', role: 'sales' }) }, [open])
  async function save() {
    setBusy(true)
    try {
      await callAdmin({ action: 'create', ...f, login: f.login || f.phone })
      toast.success(`${f.full_name} can now sign in`, `User name: ${(f.login || f.phone).trim()}`)
      onDone(); onClose()
    } catch (e) { toast.error('Not created', errorText(e)) } finally { setBusy(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title="Add staff login" footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy} onClick={save}>{busy ? <RingSpinner size={16} /> : <UserRound className="size-4" />} Create login</button></>}>
      <div className="grid gap-3">
        <Field label="Full name"><input className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} autoFocus /></Field>
        <Field label="Mobile number" hint="They can sign in with this number"><input className="input" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="…or a user name" hint="Optional, e.g. raghu"><input className="input" value={f.login} onChange={(e) => setF({ ...f, login: e.target.value.toLowerCase() })} /></Field>
        <Field label="Password" hint="At least 8 characters — share it with them privately"><input className="input" type="text" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        <Field label="Role"><select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>{(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
      </div>
    </Modal>
  )
}

function ResetPassword({ who, onClose }: { who: Profile | null; onClose: () => void }) {
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (who) setPw('') }, [who])
  async function save() {
    setBusy(true)
    try { await callAdmin({ action: 'reset_password', user_id: who!.id, password: pw }); toast.success('Password changed'); onClose() }
    catch (e) { toast.error('Not changed', errorText(e)) } finally { setBusy(false) }
  }
  return (
    <Modal open={!!who} onClose={onClose} title={`New password for ${who?.full_name ?? ''}`} footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || pw.length < 8} onClick={save}>{busy && <RingSpinner size={16} />} Save</button></>}>
      <Field label="New password" hint="At least 8 characters"><input className="input" type="text" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus /></Field>
      <p className="mt-3 flex items-center gap-2 text-xs text-ink-mute"><Building2 className="size-3.5" /> They will need to sign in again on their devices.</p>
    </Modal>
  )
}
