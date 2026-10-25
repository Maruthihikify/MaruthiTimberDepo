import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown, Cog, Plus } from 'lucide-react'
import { must, supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { dateShort, fmt, rupees, sectionLabel, size } from '../../lib/format'
import { Chip, Empty, Meter, Money, PageHeader, SkeletonRows } from '../../components/ui'
import { Gauge } from '../../components/Charts'
import type { Conversion } from '../types'

export default function Sawmill() {
  const { can } = useAuth()
  const money = can('manager', 'accounts')
  const [open, setOpen] = useState<string | null>(null)
  const q = useQuery({
    queryKey: ['conversions'],
    queryFn: async () => must(await supabase.from('conversions')
      .select('*, conversion_inputs(*, logs(log_no,length_ft,girth_in,species(name,color_hex)), products(name)), conversion_outputs(*, products(name,thickness_in,width_in,species_id))')
      .order('conv_date', { ascending: false }).order('ref_no', { ascending: false }).limit(120)) as Conversion[],
  })
  const runs = q.data ?? []
  const tot = runs.reduce((a, r) => ({ i: a.i + Number(r.input_cft), o: a.o + Number(r.output_cft), fw: a.fw + Number(r.firewood_kg) }), { i: 0, o: 0, fw: 0 })

  return (
    <div>
      <PageHeader icon={<Cog className="size-5" />} title="Sawmill" subtitle="Logs in, sized timber out — recovery and true cost per CFT for every run"
        actions={can('manager', 'yard') && <Link to="/app/sawmill/new" className="btn-primary"><Plus className="size-4" /> New saw run</Link>} />

      <div className="mb-5 grid gap-4 md:grid-cols-[260px_1fr]">
        <div className="card p-4"><Gauge value={tot.i ? (tot.o / tot.i) * 100 : 0} label={`Average recovery · ${runs.length} runs`} /></div>
        <div className="card grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
          <K label="Logs sawn" value={`${fmt(tot.i, 1)} CFT`} />
          <K label="Timber produced" value={`${fmt(tot.o, 1)} CFT`} />
          <K label="Off-cuts / firewood" value={`${fmt(tot.fw / 1000, 1)} t`} />
          <K label="Loss to sawdust & slabs" value={`${fmt(tot.i - tot.o, 1)} CFT`} />
          <p className="col-span-2 text-xs text-ink-soft sm:col-span-4">Recovery is measured against Hoppus CFT. 65–75% is healthy for teak and hardwood logs; under 60% means thin logs, bad cutting plans or a blade that needs sharpening.</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        {q.isLoading ? <SkeletonRows /> : !runs.length ? <Empty icon={<Cog className="size-7" />} title="No saw runs yet" body="Pick logs from the log yard and record what came out." /> : (
          <ul className="divide-y divide-line/70">
            {runs.map((r, i) => {
              const species = r.conversion_inputs?.[0]?.logs?.species
              const isOpen = open === r.id
              return (
                <motion.li key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.03, 0.4) }}>
                  <button onClick={() => setOpen(isOpen ? null : r.id)} className="flex w-full flex-wrap items-center gap-3 px-4 py-3.5 text-left hover:bg-teak-50/60 sm:px-5">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ background: `${species?.color_hex ?? '#C9762A'}22`, color: species?.color_hex ?? '#C9762A' }}><Cog className="size-5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold">{r.ref_no} · {species?.name ?? r.conversion_outputs?.[0]?.products?.name}</span>
                      <span className="text-xs text-ink-soft">{dateShort(r.conv_date)} · {r.conversion_inputs?.length} input{r.conversion_inputs?.length === 1 ? '' : 's'} · {r.operator ?? '—'}</span>
                    </span>
                    <span className="num hidden text-sm sm:block">{fmt(r.input_cft, 2)} → <b>{fmt(r.output_cft, 2)}</b> CFT</span>
                    <span className="w-28"><Meter value={Number(r.yield_pct)} max={100} tone={Number(r.yield_pct) >= 65 ? 'leaf' : Number(r.yield_pct) >= 55 ? 'sun' : 'ember'} /><span className="num mt-0.5 block text-right text-xs font-bold">{fmt(r.yield_pct, 1)}%</span></span>
                    {money && <span className="num w-24 text-right text-sm font-bold text-teak-700">{rupees(r.cost_per_cft)}<span className="block text-[11px] font-semibold text-ink-mute">per CFT</span></span>}
                    <ChevronDown className={`size-4 text-ink-mute transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="grid gap-4 bg-cream/40 px-4 pb-4 pt-1 sm:px-5 md:grid-cols-2">
                          <div>
                            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-mute">Went in</p>
                            <ul className="space-y-1 text-sm">
                              {r.conversion_inputs?.map((c) => (
                                <li key={c.id} className="flex justify-between gap-2">
                                  <span>{c.logs ? `Log #${c.logs.log_no} · ${size(c.logs.length_ft)} ft × ${size(c.logs.girth_in)}″` : `${c.products?.name} × ${size(c.length_ft)} ft · ${c.pieces} pcs`}</span>
                                  <span className="num font-semibold">{fmt(c.cft, 3)} CFT</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-mute">Came out</p>
                            <div className="flex flex-wrap gap-1.5">
                              {r.conversion_outputs?.map((o) => <Chip key={o.id} tone="brown">{sectionLabel(o.products?.thickness_in, o.products?.width_in)} × {size(o.length_ft)} ft · {o.pieces} pcs</Chip>)}
                            </div>
                            {money && (
                              <p className="mt-3 text-xs text-ink-soft">Cost: logs <Money value={r.input_cost} /> + sawing <Money value={r.processing_cost} /> − firewood {fmt(r.firewood_kg, 0)} kg <Money value={r.byproduct_value} /> = <b className="text-ink"><Money value={Number(r.input_cost) + Number(r.processing_cost) - Number(r.byproduct_value)} /></b> → <b className="text-teak-700">{rupees(r.cost_per_cft)}/CFT</b></p>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function K({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[11px] font-bold uppercase tracking-wider text-ink-mute">{label}</p><p className="num font-display text-xl font-semibold">{value}</p></div>
}
