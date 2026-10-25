import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Percent, Plus, Save, Trees } from 'lucide-react'
import { must, supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { rupees } from '../../lib/format'
import { plankUrl, toneFor } from '../../lib/wood'
import { useProducts, useSpecies } from '../data'
import { Chip, Field, Modal, PageHeader } from '../../components/ui'
import { RingSpinner } from '../../components/Loader'
import { toast } from '../../components/Toast'
import type { Species } from '../types'

export default function Rates() {
  const qc = useQueryClient()
  const { can } = useAuth()
  const edit = can('manager')
  const species = useSpecies()
  const products = useProducts()
  const [draft, setDraft] = useState<Record<string, Partial<Species>>>({})
  const [busy, setBusy] = useState(false)
  const [bulk, setBulk] = useState<{ open: boolean; pct: number; ids: Set<string>; sections: boolean }>({ open: false, pct: 5, ids: new Set(), sections: true })
  const [form, setForm] = useState<Partial<Species> | null>(null)
  const list = species.data ?? []
  const sectionsCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of products.data ?? []) if (p.kind === 'sawn' && p.species_id) m.set(p.species_id, (m.get(p.species_id) ?? 0) + 1)
    return m
  }, [products.data])
  const dirty = Object.keys(draft).length > 0

  async function saveAll() {
    setBusy(true)
    try {
      for (const [id, patch] of Object.entries(draft)) must(await supabase.from('species').update(patch).eq('id', id).select().single())
      setDraft({})
      await qc.invalidateQueries({ queryKey: ['species'] })
      toast.success('Rate card saved', 'New bills use these rates; existing size rates are unchanged unless you apply a bulk change.')
    } catch (e) { toast.error('Not saved', (e as Error).message) } finally { setBusy(false) }
  }

  async function applyBulk() {
    setBusy(true)
    try {
      const f = 1 + bulk.pct / 100
      for (const s of list.filter((x) => bulk.ids.has(x.id))) {
        must(await supabase.from('species').update({ sawn_rate_cft: Math.round(Number(s.sawn_rate_cft) * f / 10) * 10, log_rate_cft: Math.round(Number(s.log_rate_cft) * f / 10) * 10 }).eq('id', s.id).select().single())
        if (bulk.sections) {
          for (const p of (products.data ?? []).filter((p) => p.kind === 'sawn' && p.species_id === s.id)) {
            must(await supabase.from('products').update({ sale_rate: Math.round(Number(p.sale_rate) * f / 10) * 10 }).eq('id', p.id).select().single())
          }
        }
      }
      await qc.invalidateQueries({ queryKey: ['species'] }); await qc.invalidateQueries({ queryKey: ['products'] }); await qc.invalidateQueries({ queryKey: ['stock'] })
      toast.success(`Rates ${bulk.pct >= 0 ? 'raised' : 'reduced'} by ${Math.abs(bulk.pct)}%`, `${bulk.ids.size} species updated`)
      setBulk({ ...bulk, open: false })
    } catch (e) { toast.error('Not applied', (e as Error).message) } finally { setBusy(false) }
  }

  async function saveNew() {
    if (!form?.name?.trim()) return toast.error('Enter the species name')
    setBusy(true)
    try {
      must(await supabase.from('species').insert({ ...form, name: form.name.trim() }).select().single())
      await qc.invalidateQueries({ queryKey: ['species'] })
      toast.success(`${form.name} added`)
      setForm(null)
    } catch (e) { toast.error('Not saved', (e as Error).message) } finally { setBusy(false) }
  }

  const val = (s: Species, k: keyof Species) => (draft[s.id]?.[k] ?? s[k]) as number
  const set = (s: Species, k: keyof Species, v: number | boolean) => setDraft((d) => ({ ...d, [s.id]: { ...d[s.id], [k]: v } }))

  return (
    <div>
      <PageHeader icon={<Trees className="size-5" />} title="Species & rates" subtitle="Your rate card. Each size also keeps its own selling rate (set on Products or with a bulk change)."
        actions={edit && <>
          <button className="btn-ghost" onClick={() => setForm({ category: 'hardwood', gst_rate: 18, hsn_log: '4403', hsn_sawn: '4407', color_hex: '#B8742F', grain_hex: '#6B3F1D', is_public: true, sort_order: 50 })}><Plus className="size-4" /> Species</button>
          <button className="btn-soft" onClick={() => setBulk({ ...bulk, open: true, ids: new Set(list.map((s) => s.id)) })}><Percent className="size-4" /> Bulk rate change</button>
          {dirty && <button className="btn-primary" disabled={busy} onClick={saveAll}>{busy ? <RingSpinner size={16} /> : <Save className="size-4" />} Save changes</button>}
        </>} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.map((s, i) => (
          <motion.div key={s.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.04, 0.4) }} className={`card overflow-hidden ${draft[s.id] ? 'ring-2 ring-teak-300' : ''}`}>
            <div className="relative h-24" style={{ backgroundImage: `url(${plankUrl(toneFor(s.name, s.color_hex, s.grain_hex, i + 1), 640, 120)})`, backgroundSize: 'cover' }}>
              <div className="absolute inset-0 bg-gradient-to-t from-[#2b1c11]/65 to-transparent" />
              <div className="absolute bottom-2.5 left-4 right-4 flex items-end justify-between text-white">
                <div><p className="font-display text-xl font-semibold drop-shadow">{s.name}</p><p className="text-xs font-semibold text-white/85">{s.local_name} · {s.botanical_name}</p></div>
                {!s.is_public && <Chip>Hidden on website</Chip>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 p-4">
              <Field label="Sawn ₹ / CFT"><input disabled={!edit} className="input num font-bold" type="number" min={0} value={val(s, 'sawn_rate_cft')} onChange={(e) => set(s, 'sawn_rate_cft', Number(e.target.value))} /></Field>
              <Field label="Log ₹ / CFT (Hoppus)"><input disabled={!edit} className="input num font-bold" type="number" min={0} value={val(s, 'log_rate_cft')} onChange={(e) => set(s, 'log_rate_cft', Number(e.target.value))} /></Field>
              <p className="col-span-2 text-xs text-ink-soft">{s.origin} · {s.density_kg_m3 ?? '—'} kg/m³ · GST {s.gst_rate}% · HSN {s.hsn_sawn}/{s.hsn_log} · {sectionsCount.get(s.id) ?? 0} sizes</p>
              {s.uses && <p className="col-span-2 text-xs text-ink-mute">{s.uses}</p>}
              {edit && <label className="col-span-2 flex items-center gap-2 text-xs font-semibold text-ink-soft"><input type="checkbox" className="accent-teak-500" checked={Boolean(draft[s.id]?.is_public ?? s.is_public)} onChange={(e) => set(s, 'is_public', e.target.checked)} /> Show on website</label>}
            </div>
          </motion.div>
        ))}
      </div>

      <Modal open={bulk.open} onClose={() => setBulk({ ...bulk, open: false })} title="Bulk rate change"
        footer={<><button className="btn-ghost" onClick={() => setBulk({ ...bulk, open: false })}>Cancel</button><button className="btn-primary" disabled={busy || !bulk.ids.size} onClick={applyBulk}>{busy && <RingSpinner size={16} />} Apply {bulk.pct >= 0 ? '+' : ''}{bulk.pct}%</button></>}>
        <div className="space-y-4">
          <Field label="Change by %" hint="Use a minus for a reduction. Rates are rounded to the nearest ₹10."><input className="input num w-40" type="number" step={0.5} value={bulk.pct} onChange={(e) => setBulk({ ...bulk, pct: Number(e.target.value) })} /></Field>
          <div className="flex flex-wrap gap-1.5">
            {list.map((s) => (
              <button key={s.id} type="button" onClick={() => setBulk((b) => { const ids = new Set(b.ids); if (ids.has(s.id)) ids.delete(s.id); else ids.add(s.id); return { ...b, ids } })}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold ${bulk.ids.has(s.id) ? 'bg-teak-500 text-white' : 'bg-cream text-ink-soft'}`}>{s.name} · {rupees(s.sawn_rate_cft)}</button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="accent-teak-500" checked={bulk.sections} onChange={(e) => setBulk({ ...bulk, sections: e.target.checked })} /> Also change the selling rate of every size of these species</label>
        </div>
      </Modal>

      <Modal open={!!form} onClose={() => setForm(null)} wide title="New species" footer={<><button className="btn-ghost" onClick={() => setForm(null)}>Cancel</button><button className="btn-primary" disabled={busy} onClick={saveNew}>Save</button></>}>
        {form && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name *"><input className="input" value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Local / Kannada name"><input className="input" value={form.local_name ?? ''} onChange={(e) => setForm({ ...form, local_name: e.target.value })} /></Field>
            <Field label="Botanical name"><input className="input" value={form.botanical_name ?? ''} onChange={(e) => setForm({ ...form, botanical_name: e.target.value })} /></Field>
            <Field label="Origin"><input className="input" value={form.origin ?? ''} onChange={(e) => setForm({ ...form, origin: e.target.value })} /></Field>
            <Field label="Category"><select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as Species['category'] })}>{['hardwood', 'softwood', 'imported', 'plantation'].map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Density kg/m³"><input className="input num" type="number" value={form.density_kg_m3 ?? ''} onChange={(e) => setForm({ ...form, density_kg_m3: Number(e.target.value) })} /></Field>
            <Field label="Sawn ₹/CFT"><input className="input num" type="number" value={form.sawn_rate_cft ?? ''} onChange={(e) => setForm({ ...form, sawn_rate_cft: Number(e.target.value) })} /></Field>
            <Field label="Log ₹/CFT"><input className="input num" type="number" value={form.log_rate_cft ?? ''} onChange={(e) => setForm({ ...form, log_rate_cft: Number(e.target.value) })} /></Field>
            <Field label="Wood colour"><input className="input h-11" type="color" value={form.color_hex} onChange={(e) => setForm({ ...form, color_hex: e.target.value })} /></Field>
            <Field label="Grain colour"><input className="input h-11" type="color" value={form.grain_hex} onChange={(e) => setForm({ ...form, grain_hex: e.target.value })} /></Field>
            <Field label="Uses" className="sm:col-span-2"><input className="input" value={form.uses ?? ''} onChange={(e) => setForm({ ...form, uses: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
    </div>
  )
}
