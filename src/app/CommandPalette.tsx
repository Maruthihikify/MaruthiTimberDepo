import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, FileText, Layers, Search, User } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { rupees, sectionLabel } from '../lib/format'
import { NAV, allowed } from './nav'
import { useParties, useSawnStock } from './data'
import { useDebounced } from '../components/ui'

interface Hit { key: string; icon: typeof Search; title: string; sub?: string; to: string }

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate()
  const { profile } = useAuth()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const dq = useDebounced(q.trim(), 180)
  const parties = useParties()
  const stock = useSawnStock()

  useEffect(() => { if (open) { setQ(''); setTimeout(() => input.current?.focus(), 30) } }, [open])

  const docs = useQuery({
    queryKey: ['palette-docs', dq],
    enabled: open && dq.length >= 2,
    queryFn: async () => {
      const like = `%${dq.replace(/[%_]/g, '')}%`
      const { data } = await supabase.from('sales_docs').select('id,doc_no,doc_type,customer_name,total,doc_date')
        .or(`doc_no.ilike.${like},customer_name.ilike.${like},customer_phone.ilike.${like}`).order('doc_date', { ascending: false }).limit(6)
      return data ?? []
    },
    meta: { persist: false },
  })

  const hits = useMemo<Hit[]>(() => {
    const t = dq.toLowerCase()
    const pages: Hit[] = NAV.flatMap((g) => g.items).filter((i) => allowed(i, profile?.role))
      .filter((i) => !t || i.label.toLowerCase().includes(t))
      .map((i) => ({ key: 'p' + i.to, icon: i.icon, title: i.label, sub: 'Go to page', to: i.to }))
    if (!t) return pages.slice(0, 8)
    const ps: Hit[] = (parties.data ?? []).filter((p) => `${p.name} ${p.phone ?? ''} ${p.city ?? ''}`.toLowerCase().includes(t)).slice(0, 5)
      .map((p) => ({ key: 'party' + p.id, icon: User, title: p.name, sub: [p.city, p.phone].filter(Boolean).join(' · '), to: `/app/parties/${p.id}` }))
    const seen = new Set<string>()
    const ss: Hit[] = (stock.data ?? []).filter((r) => `${r.name} ${r.thickness_in}x${r.width_in} ${r.thickness_in}×${r.width_in}`.toLowerCase().includes(t.replace('*', 'x')))
      .filter((r) => (seen.has(r.product_id) ? false : (seen.add(r.product_id), true))).slice(0, 4)
      .map((r) => ({ key: 'stock' + r.product_id, icon: Layers, title: r.name, sub: `${sectionLabel(r.thickness_in, r.width_in)} in stock`, to: `/app/stock?q=${encodeURIComponent(r.species_name)}` }))
    const ds: Hit[] = (docs.data ?? []).map((d) => ({ key: 'doc' + d.id, icon: FileText, title: `${d.doc_no} · ${d.customer_name}`, sub: `${d.doc_type.replace('_', ' ')} · ${rupees(d.total)}`, to: `/app/sales/${d.id}` }))
    return [...ds, ...ps, ...ss, ...pages].slice(0, 14)
  }, [dq, parties.data, stock.data, docs.data, profile?.role])

  useEffect(() => { setActive(0) }, [dq])

  const go = (h: Hit) => { nav(h.to); onClose() }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90] flex items-start justify-center px-3 pt-[12vh]">
          <motion.div className="absolute inset-0 bg-teak-900/30 backdrop-blur-[3px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div initial={{ opacity: 0, y: -16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.98 }} transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-line bg-paper shadow-lift">
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="size-5 text-teak-500" />
              <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Bill number, customer, phone, size like 5x3…"
                className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-ink-mute"
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(hits.length - 1, a + 1)) }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
                  if (e.key === 'Enter' && hits[active]) go(hits[active])
                  if (e.key === 'Escape') onClose()
                }} />
              <kbd className="rounded-md border border-line bg-cream px-1.5 text-[10px] font-bold text-ink-soft">Esc</kbd>
            </div>
            <ul className="max-h-[52vh] overflow-y-auto p-2">
              {hits.length === 0 && <li className="px-4 py-8 text-center text-sm text-ink-mute">{docs.isFetching ? 'Searching…' : 'No matches'}</li>}
              {hits.map((h, i) => (
                <li key={h.key}>
                  <button onMouseEnter={() => setActive(i)} onClick={() => go(h)} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left ${i === active ? 'bg-teak-50' : ''}`}>
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-cream text-teak-600"><h.icon className="size-4.5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-ink">{h.title}</span>
                      {h.sub && <span className="block truncate text-xs capitalize text-ink-soft">{h.sub}</span>}
                    </span>
                    {i === active && <ArrowRight className="size-4 text-teak-500" />}
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
