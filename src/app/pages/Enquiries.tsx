import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { FileText, MessageCircle, MessageSquareText, Phone } from 'lucide-react'
import { must, supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { dateTime, phoneLink, relDays, whatsappLink } from '../../lib/format'
import { Chip, Empty, PageHeader, Tabs } from '../../components/ui'
import { toast } from '../../components/Toast'
import { useSettings } from '../data'
import type { Enquiry } from '../types'

const STATUS: Record<Enquiry['status'], { label: string; tone: 'blue' | 'amber' | 'brown' | 'green' | 'red' }> = {
  new: { label: 'New', tone: 'blue' }, contacted: { label: 'Contacted', tone: 'amber' }, quoted: { label: 'Quoted', tone: 'brown' }, won: { label: 'Won', tone: 'green' }, lost: { label: 'Lost', tone: 'red' },
}

export default function Enquiries() {
  const qc = useQueryClient()
  const { can } = useAuth()
  const settings = useSettings()
  const [tab, setTab] = useState<'open' | 'closed'>('open')
  const q = useQuery({
    queryKey: ['enquiries'],
    queryFn: async () => must(await supabase.from('enquiries').select('*').order('created_at', { ascending: false }).limit(300)) as Enquiry[],
    refetchInterval: 60_000,
  })
  const rows = (q.data ?? []).filter((e) => (tab === 'open' ? ['new', 'contacted', 'quoted'].includes(e.status) : ['won', 'lost'].includes(e.status)))
  async function setStatus(e: Enquiry, status: Enquiry['status']) {
    const { error } = await supabase.from('enquiries').update({ status }).eq('id', e.id)
    if (error) return toast.error('Not updated', error.message)
    void qc.invalidateQueries({ queryKey: ['enquiries'] }); void qc.invalidateQueries({ queryKey: ['dashboard'] })
  }
  return (
    <div>
      <PageHeader icon={<MessageSquareText className="size-5" />} title="Website enquiries" subtitle="Requests from the website’s quote form — call back fast, send a quotation in one tap"
        actions={<Tabs value={tab} onChange={setTab} items={[{ value: 'open', label: 'Open', count: (q.data ?? []).filter((e) => ['new', 'contacted', 'quoted'].includes(e.status)).length }, { value: 'closed', label: 'Closed' }]} />} />
      {q.isLoading ? <div className="skeleton h-60" /> : !rows.length ? <div className="card"><Empty icon={<MessageSquareText className="size-7" />} title="No enquiries here" body="New requests from the website appear instantly." /></div> : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((e, i) => (
            <motion.div key={e.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.04, 0.4) }} className={`card p-4 ${e.status === 'new' ? 'ring-2 ring-sky-100' : ''}`}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{e.name} <span className="text-sm font-semibold text-ink-soft">· {e.city ?? '—'}</span></p>
                  <p className="text-xs text-ink-soft">{e.phone} · {dateTime(e.created_at)} ({relDays(e.created_at)})</p>
                </div>
                <Chip tone={STATUS[e.status].tone} dot={e.status === 'new'}>{STATUS[e.status].label}</Chip>
              </div>
              <p className="mt-3 rounded-2xl bg-cream/60 px-3 py-2.5 text-sm">{e.requirement}</p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                {e.species_interest && <Chip tone="brown">{e.species_interest}</Chip>}
                {e.est_cft && <Chip>~{e.est_cft} CFT</Chip>}
                {e.notes && <span className="text-ink-soft">{e.notes}</span>}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <a className="btn-ghost btn-sm" href={`tel:${phoneLink(e.phone)}`} onClick={() => e.status === 'new' && setStatus(e, 'contacted')}><Phone className="size-3.5" /> Call</a>
                <a className="btn-ghost btn-sm" target="_blank" rel="noreferrer" href={whatsappLink(e.phone, `Namaskara ${e.name}, thank you for contacting ${settings.data?.name ?? 'Maruthi Timber Depot'} about: ${e.requirement.slice(0, 80)}. `)} onClick={() => e.status === 'new' && setStatus(e, 'contacted')}><MessageCircle className="size-3.5 text-leaf-500" /> WhatsApp</a>
                {can('manager', 'accounts', 'sales') && e.status !== 'won' && (e.quotation_id
                  ? <Link className="btn-soft btn-sm" to={`/app/sales/${e.quotation_id}`}><FileText className="size-3.5" /> Open quotation</Link>
                  : <Link className="btn-primary btn-sm" to={`/app/sales/new?enquiry=${e.id}`}><FileText className="size-3.5" /> Make quotation</Link>)}
                <select className="input input-sm ml-auto w-auto" value={e.status} onChange={(ev) => setStatus(e, ev.target.value as Enquiry['status'])}>
                  {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
