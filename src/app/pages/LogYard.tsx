import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Cog, MapPin, ReceiptIndianRupee, TreePine } from 'lucide-react'
import { must, rpc, supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { daysBetween, dateShort, fmt, rupees, size, todayIST } from '../../lib/format'
import { cftToCbm, trueLogCft } from '../../lib/timber'
import { endGrainUrl, toneFor } from '../../lib/wood'
import { useYardLogs } from '../data'
import { Chip, Empty, Field, Modal, Money, PageHeader, SearchBox, SkeletonRows, Tabs } from '../../components/ui'
import { toast } from '../../components/Toast'
import type { Log } from '../types'

export default function LogYard() {
  const nav = useNavigate()
  const { can } = useAuth()
  const money = can('manager', 'accounts')
  const yard = useYardLogs()
  const [tab, setTab] = useState<'yard' | 'history'>('yard')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [bayFor, setBayFor] = useState<Log | null>(null)

  const logs = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (yard.data ?? []).filter((l) => !t || `${l.log_no} ${l.species?.name} ${l.bay ?? ''} ${l.grade ?? ''}`.toLowerCase().includes(t))
  }, [yard.data, q])
  const bySpecies = useMemo(() => {
    const m = new Map<string, { name: string; n: number; cft: number; value: number }>()
    for (const l of yard.data ?? []) {
      const k = l.species?.name ?? '?'
      const r = m.get(k) ?? { name: k, n: 0, cft: 0, value: 0 }
      r.n++; r.cft += Number(l.cft); r.value += Number(l.cft) * Number(l.cost_per_cft)
      m.set(k, r)
    }
    return [...m.values()].sort((a, b) => b.cft - a.cft)
  }, [yard.data])
  const selected = logs.filter((l) => sel.has(l.id))
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <div>
      <PageHeader icon={<TreePine className="size-5" />} title="Log yard" subtitle="Round logs measured by the Hoppus (quarter-girth) rule — the trade standard for buying and selling logs"
        actions={<Tabs value={tab} onChange={setTab} items={[{ value: 'yard', label: 'In the yard', count: yard.data?.length }, { value: 'history', label: 'Sawn & sold' }]} />} />

      {tab === 'yard' ? (
        <>
          <div className="no-scrollbar -mx-1 mb-4 flex gap-3 overflow-x-auto px-1 pb-1">
            {bySpecies.map((s, i) => (
              <motion.button key={s.name} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} onClick={() => setQ(q === s.name ? '' : s.name)}
                className={`card card-hover flex shrink-0 items-center gap-3 p-3 pr-5 text-left ${q === s.name ? 'ring-2 ring-teak-400' : ''}`}>
                <img src={endGrainUrl({ ...toneFor(s.name, null, null, i + 2), rings: 6 }, 96)} alt="" className="size-12 rounded-full shadow-md" />
                <span>
                  <span className="block text-sm font-bold">{s.name}</span>
                  <span className="num block text-xs text-ink-soft">{s.n} logs · {fmt(s.cft, 1)} CFT</span>
                  {money && <span className="num block text-xs font-semibold text-teak-700">{rupees(s.value)}</span>}
                </span>
              </motion.button>
            ))}
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <SearchBox value={q} onChange={setQ} placeholder="Log number, species, bay…" className="w-full sm:w-72" />
            {selected.length > 0 && (
              <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="flex flex-wrap items-center gap-2 sm:ml-auto">
                <span className="text-sm font-semibold text-ink-soft">{selected.length} selected · {fmt(selected.reduce((a, l) => a + Number(l.cft), 0), 3)} CFT</span>
                {can('manager', 'yard') && <button className="btn-primary" onClick={() => nav(`/app/sawmill/new?logs=${selected.map((l) => l.id).join(',')}`)}><Cog className="size-4" /> Send to saw</button>}
                {can('manager', 'accounts', 'sales') && <button className="btn-ghost" onClick={() => nav(`/app/sales/new?logs=${selected.map((l) => l.id).join(',')}`)}><ReceiptIndianRupee className="size-4" /> Sell as logs</button>}
              </motion.div>
            )}
          </div>

          <div className="card overflow-hidden">
            {yard.isLoading ? <SkeletonRows rows={8} /> : logs.length === 0 ? <Empty icon={<TreePine className="size-7" />} title="No logs in the yard" body="Log purchases appear here with their numbers and measurements." /> : (
              <div className="overflow-x-auto">
                <table className="table-x">
                  <thead><tr><th className="w-8" /><th>Log</th><th className="text-right">Length</th><th className="text-right">Girth</th><th className="text-right">Hoppus</th><th className="text-right">True vol.</th>{money && <th className="text-right">Cost / CFT</th>}<th className="text-right">Sell / CFT</th><th>In yard</th><th>Bay</th></tr></thead>
                  <tbody>
                    {logs.map((l) => {
                      const age = daysBetween(l.received_on, todayIST())
                      return (
                        <tr key={l.id} className={sel.has(l.id) ? '!bg-teak-50' : ''}>
                          <td><input type="checkbox" className="size-4 accent-teak-500" checked={sel.has(l.id)} onChange={() => toggle(l.id)} /></td>
                          <td>
                            <div className="flex items-center gap-2.5">
                              <img src={endGrainUrl({ ...toneFor(l.species?.name ?? '', l.species?.color_hex, l.species?.grain_hex, Number(l.log_no.replace(/\D/g, '')) % 17), rings: 5 + (Number(l.girth_in) % 4) }, 72)} alt="" className="shrink-0 rounded-full shadow" style={{ width: 22 + Number(l.girth_in) / 5, height: 22 + Number(l.girth_in) / 5 }} />
                              <span>
                                <span className="block whitespace-nowrap font-bold">#{l.log_no}</span>
                                <span className="whitespace-nowrap text-xs text-ink-soft">{l.species?.name}{l.grade ? ` · ${l.grade}` : ''}</span>
                              </span>
                            </div>
                          </td>
                          <td className="num text-right">{size(l.length_ft)} ft</td>
                          <td className="num text-right">{size(l.girth_in)}″{Number(l.bark_allowance_in) > 0 && <span className="block text-[11px] text-ink-mute">−{size(l.bark_allowance_in)}″ bark</span>}</td>
                          <td className="num text-right font-bold">{fmt(l.cft, 3)}<span className="block text-[11px] font-semibold text-ink-mute">{fmt(cftToCbm(Number(l.cft)), 3)} m³</span></td>
                          <td className="num text-right text-ink-soft">{fmt(trueLogCft(Number(l.girth_in) - Number(l.bark_allowance_in), Number(l.length_ft)), 2)}</td>
                          {money && <td className="text-right"><Money value={l.cost_per_cft} /></td>}
                          <td className="text-right"><Money value={l.sale_rate_cft ?? l.species?.log_rate_cft ?? 0} /></td>
                          <td>{age >= 90 ? <Chip tone="green">{age} days · seasoned</Chip> : <Chip tone={age >= 30 ? 'amber' : 'grey'}>{age} days</Chip>}</td>
                          <td>
                            <button disabled={!can('manager', 'yard')} onClick={() => setBayFor(l)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-ink-soft enabled:hover:bg-teak-50 enabled:hover:text-teak-700">
                              <MapPin className="size-3.5" />{l.bay ?? 'Set bay'}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <p className="mt-3 text-xs text-ink-mute">Hoppus CFT = ((girth − bark allowance) ÷ 4)² × length ÷ 144. It is about 78.5% of the log’s true round volume — the trade allows for slabs and sapwood lost in sawing.</p>
        </>
      ) : <History />}

      <BayModal log={bayFor} onClose={() => setBayFor(null)} />
    </div>
  )
}

function History() {
  const q = useQuery({
    queryKey: ['logs', 'history'],
    queryFn: async () => must(await supabase.from('logs').select('*, species(name,color_hex,grain_hex,log_rate_cft)').neq('status', 'in_yard').order('created_at', { ascending: false }).limit(300)) as Log[],
  })
  return (
    <div className="card overflow-hidden">
      {q.isLoading ? <SkeletonRows /> : !q.data?.length ? <Empty title="No logs sawn or sold yet" /> : (
        <div className="overflow-x-auto">
          <table className="table-x">
            <thead><tr><th>Log</th><th className="text-right">L × G</th><th className="text-right">Hoppus CFT</th><th>Received</th><th>Status</th></tr></thead>
            <tbody>
              {q.data.map((l) => (
                <tr key={l.id}>
                  <td><span className="font-bold">#{l.log_no}</span> <span className="text-xs text-ink-soft">{l.species?.name}</span></td>
                  <td className="num text-right">{size(l.length_ft)} ft × {size(l.girth_in)}″</td>
                  <td className="num text-right font-semibold">{fmt(l.cft, 3)}</td>
                  <td className="text-ink-soft">{dateShort(l.received_on)}</td>
                  <td><Chip tone={l.status === 'sawn' ? 'brown' : l.status === 'sold' ? 'green' : 'red'}>{l.status === 'written_off' ? 'written off' : l.status}</Chip>{l.remarks && <span className="ml-2 text-xs text-ink-mute">{l.remarks}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function BayModal({ log, onClose }: { log: Log | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [bay, setBay] = useState('')
  const [remarks, setRemarks] = useState('')
  const [last, setLast] = useState<string | null>(null)
  if (log && log.id !== last) { setLast(log.id); setBay(log.bay ?? ''); setRemarks(log.remarks ?? '') }
  async function save() {
    if (!log) return
    try {
      await rpc('set_log_bay', { p_log: log.id, p_bay: bay, p_remarks: remarks })
      await qc.invalidateQueries({ queryKey: ['logs'] })
      toast.success(`Log #${log.log_no} moved to ${bay || 'no bay'}`)
      onClose()
    } catch (e) { toast.error('Not saved', (e as Error).message) }
  }
  return (
    <Modal open={!!log} onClose={onClose} title={`Where is log #${log?.log_no}?`} footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save}>Save</button></>}>
      <div className="grid gap-3">
        <Field label="Bay / stack"><input className="input" list="bays" value={bay} onChange={(e) => setBay(e.target.value)} placeholder="Yard A, Yard B, Shed 2…" /></Field>
        <datalist id="bays">{['Yard A', 'Yard B', 'Yard C', 'Mill shed', 'Shed P', 'Kiln'].map((b) => <option key={b} value={b} />)}</datalist>
        <Field label="Remarks"><input className="input" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Heart crack at butt end, bent 1 inch…" /></Field>
      </div>
    </Modal>
  )
}
