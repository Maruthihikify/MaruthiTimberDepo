import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Boxes, Pencil, Plus } from 'lucide-react'
import { must, supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { fmt, rupees, sectionLabel } from '../../lib/format'
import { UOM_LABEL } from '../../lib/timber'
import { useProducts, useSpecies } from '../data'
import { Chip, Empty, Field, Modal, PageHeader, SearchBox, SkeletonRows, Tabs } from '../../components/ui'
import { RingSpinner } from '../../components/Loader'
import { toast } from '../../components/Toast'
import type { Product } from '../types'

type Kind = Product['kind']
const KIND_LABEL: Record<Kind, string> = { sawn: 'Sawn sizes', panel: 'Plywood & boards', unit: 'Doors, frames & items', service: 'Services & charges', byproduct: 'Byproducts' }

export default function Products() {
  const { can } = useAuth()
  const products = useProducts()
  const species = useSpecies()
  const [kind, setKind] = useState<Kind>('sawn')
  const [q, setQ] = useState('')
  const [form, setForm] = useState<Partial<Product> | null>(null)
  const S = new Map((species.data ?? []).map((s) => [s.id, s.name]))
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (products.data ?? []).filter((p) => p.kind === kind && (!t || `${p.name} ${S.get(p.species_id ?? '') ?? ''}`.toLowerCase().includes(t)))
  }, [products.data, kind, q, S])

  return (
    <div>
      <PageHeader icon={<Boxes className="size-5" />} title="Products" subtitle="Every size, sheet, door and charge you can bill — with its own rate, HSN and GST"
        actions={can('manager') && <button className="btn-primary" onClick={() => setForm({ kind: kind === 'sawn' ? 'panel' : kind, uom: kind === 'panel' || kind === 'sawn' ? 'sqft' : kind === 'service' ? 'job' : 'nos', gst_rate: 18, active: true, panel_length_ft: 8, panel_width_ft: 4 })}><Plus className="size-4" /> Add item</button>} />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Tabs value={kind} onChange={setKind} items={(Object.keys(KIND_LABEL) as Kind[]).map((k) => ({ value: k, label: KIND_LABEL[k], count: (products.data ?? []).filter((p) => p.kind === k).length }))} />
        <SearchBox value={q} onChange={setQ} className="lg:ml-auto lg:w-64" />
      </div>
      {kind === 'sawn' && <p className="mb-3 text-sm text-ink-soft">Sawn sizes are created automatically the first time a size is bought or sawn. Set each size’s selling rate and minimum stock here.</p>}
      <div className="card overflow-hidden">
        {products.isLoading ? <SkeletonRows /> : !rows.length ? <Empty icon={<Boxes className="size-7" />} title="Nothing here yet" /> : (
          <div className="overflow-x-auto">
            <table className="table-x">
              <thead><tr><th>Item</th><th>HSN · GST</th><th className="text-right">Sale rate</th>{can('manager', 'accounts') && <th className="text-right">Avg cost</th>}<th className="text-right">Min stock</th><th>Bay</th>{can('manager') && <th />}</tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className={p.active ? '' : 'opacity-50'}>
                    <td><p className="font-semibold">{p.kind === 'sawn' ? `${S.get(p.species_id ?? '')} ${sectionLabel(p.thickness_in, p.width_in)}` : p.name}{p.grade && <Chip tone="brown">{p.grade}</Chip>}</p>{p.kind === 'panel' && <p className="text-xs text-ink-soft">{fmt(p.sheet_sqft)} sq.ft sheet · {fmt(p.thickness_mm)} mm</p>}</td>
                    <td className="text-ink-soft">{p.hsn ?? '—'} · {fmt(p.gst_rate)}%</td>
                    <td className="num text-right font-bold">{rupees(p.sale_rate)}<span className="text-xs font-semibold text-ink-mute">/{UOM_LABEL[p.uom] ?? p.uom}</span></td>
                    {can('manager', 'accounts') && <td className="num text-right text-ink-soft">{Number(p.avg_cost) ? rupees(p.avg_cost) : '—'}</td>}
                    <td className="num text-right">{Number(p.min_stock) ? `${fmt(p.min_stock)} ${p.kind === 'sawn' ? 'CFT' : p.kind === 'panel' ? 'sheets' : UOM_LABEL[p.uom] ?? ''}` : '—'}</td>
                    <td className="text-xs text-ink-soft">{p.bay ?? '—'}</td>
                    {can('manager') && <td className="text-right"><button className="btn-ghost btn-sm" onClick={() => setForm(p)}><Pencil className="size-3.5" /> Edit</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ProductForm value={form} onClose={() => setForm(null)} />
    </div>
  )
}

function ProductForm({ value, onClose }: { value: Partial<Product> | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [f, setF] = useState<Partial<Product>>({})
  const [last, setLast] = useState<Partial<Product> | null>(null)
  const [busy, setBusy] = useState(false)
  if (value !== last) { setLast(value); setF(value ?? {}) }
  const isNew = !value?.id
  async function save() {
    if (f.kind !== 'sawn' && !f.name?.trim()) return toast.error('Enter the name')
    setBusy(true)
    try {
      const row: Partial<Product> = {
        sale_rate: Number(f.sale_rate) || 0, min_stock: Number(f.min_stock) || 0, bay: f.bay || null, gst_rate: Number(f.gst_rate ?? 18), hsn: f.hsn || null, active: f.active ?? true, grade: f.grade || null,
      }
      if (f.kind !== 'sawn') Object.assign(row, { name: f.name!.trim(), kind: f.kind, uom: f.kind === 'panel' ? 'sqft' : f.uom, brand: f.brand || null,
        ...(f.kind === 'panel' ? { panel_length_ft: Number(f.panel_length_ft) || 8, panel_width_ft: Number(f.panel_width_ft) || 4, thickness_mm: Number(f.thickness_mm) || null } : {}) })
      if (isNew) must(await supabase.from('products').insert(row).select().single())
      else must(await supabase.from('products').update(row).eq('id', value!.id!).select().single())
      await qc.invalidateQueries({ queryKey: ['products'] }); await qc.invalidateQueries({ queryKey: ['stock'] })
      toast.success('Saved')
      onClose()
    } catch (e) { toast.error('Not saved', (e as Error).message) } finally { setBusy(false) }
  }
  return (
    <Modal open={!!value} onClose={onClose} wide title={isNew ? 'New item' : `Edit ${f.name ?? ''}`} footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy} onClick={save}>{busy && <RingSpinner size={16} />} Save</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {isNew && <Field label="Type"><select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Kind, uom: e.target.value === 'panel' ? 'sqft' : e.target.value === 'service' ? 'job' : e.target.value === 'byproduct' ? 'kg' : 'nos' })}>{(['panel', 'unit', 'service', 'byproduct'] as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></Field>}
        {f.kind !== 'sawn' && <Field label="Name *"><input className="input" value={f.name ?? ''} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>}
        {f.kind === 'panel' && <>
          <Field label="Sheet length (ft)"><input className="input num" type="number" value={f.panel_length_ft ?? 8} onChange={(e) => setF({ ...f, panel_length_ft: Number(e.target.value) })} /></Field>
          <Field label="Sheet width (ft)"><input className="input num" type="number" value={f.panel_width_ft ?? 4} onChange={(e) => setF({ ...f, panel_width_ft: Number(e.target.value) })} /></Field>
          <Field label="Thickness (mm)"><input className="input num" type="number" value={f.thickness_mm ?? ''} onChange={(e) => setF({ ...f, thickness_mm: Number(e.target.value) })} /></Field>
        </>}
        {f.kind !== 'sawn' && f.kind !== 'panel' && <Field label="Unit"><select className="input" value={f.uom} onChange={(e) => setF({ ...f, uom: e.target.value })}>{['nos', 'rft', 'kg', 'load', 'job', 'cft', 'sqft'].map((u) => <option key={u} value={u}>{UOM_LABEL[u]}</option>)}</select></Field>}
        <Field label={`Sale rate ₹ / ${f.kind === 'sawn' ? 'CFT' : UOM_LABEL[f.uom ?? ''] ?? f.uom}`}><input className="input num font-bold" type="number" min={0} value={f.sale_rate ?? ''} onChange={(e) => setF({ ...f, sale_rate: Number(e.target.value) })} /></Field>
        <Field label="HSN / SAC"><input className="input" value={f.hsn ?? ''} onChange={(e) => setF({ ...f, hsn: e.target.value })} placeholder={f.kind === 'service' ? '998898' : '4412'} /></Field>
        <Field label="GST %"><select className="input" value={f.gst_rate ?? 18} onChange={(e) => setF({ ...f, gst_rate: Number(e.target.value) })}>{[0, 5, 12, 18, 28].map((g) => <option key={g} value={g}>{g}%</option>)}</select></Field>
        <Field label={`Minimum stock (${f.kind === 'sawn' ? 'CFT' : f.kind === 'panel' ? 'sheets' : 'qty'})`} hint="Below this, the dashboard warns you"><input className="input num" type="number" min={0} value={f.min_stock ?? ''} onChange={(e) => setF({ ...f, min_stock: Number(e.target.value) })} /></Field>
        <Field label="Bay / shelf"><input className="input" value={f.bay ?? ''} onChange={(e) => setF({ ...f, bay: e.target.value })} /></Field>
        {f.kind === 'sawn' && <Field label="Grade"><input className="input" value={f.grade ?? ''} disabled /></Field>}
        <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2"><input type="checkbox" className="accent-teak-500" checked={f.active ?? true} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active (can be billed)</label>
      </div>
    </Modal>
  )
}
