import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { MessageCircle, Phone, Send } from 'lucide-react'
import { errorText, rpc, supabaseConfigured } from '../../lib/supabase'
import { phoneLink, whatsappLink } from '../../lib/format'
import type { PublicCompany, PublicSpecies } from '../data'
import { SectionHeading } from '../ui'

interface Form {
  name: string
  phone: string
  city: string
  email: string
  species: string
  est_cft: string
  requirement: string
}
const EMPTY: Form = { name: '', phone: '', city: '', email: '', species: '', est_cft: '', requirement: '' }

function validate(f: Form): Partial<Record<keyof Form, string>> {
  const e: Partial<Record<keyof Form, string>> = {}
  if (f.name.trim().length < 2) e.name = 'Please tell us your name'
  const d = f.phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '')
  if (!/^[6-9]\d{9}$/.test(d)) e.phone = 'Enter a 10-digit mobile number'
  if (f.requirement.trim().length < 3) e.requirement = 'A line about what you need helps us quote'
  if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) e.email = 'That e-mail looks incomplete'
  if (f.est_cft && !(Number(f.est_cft) > 0)) e.est_cft = 'Approximate CFT as a number'
  return e
}

export default function Enquiry({ company, species }: { company: PublicCompany; species: PublicSpecies[] }) {
  const [f, setF] = useState<Form>(EMPTY)
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState<{ name: string; phone: string } | null>(null)
  const reqRef = useRef<HTMLTextAreaElement>(null)
  const errors = validate(f)

  useEffect(() => {
    const on = (e: Event) => {
      const name = (e as CustomEvent<string>).detail
      setF((x) => ({ ...x, species: name, requirement: x.requirement || `${name} — ` }))
      setTimeout(() => reqRef.current?.focus({ preventScroll: true }), 700)
    }
    window.addEventListener('mtd:enquire', on)
    return () => window.removeEventListener('mtd:enquire', on)
  }, [])

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setTouched(true)
    setErr('')
    if (Object.keys(errors).length) return
    if (!supabaseConfigured) { setErr('Online enquiries are not connected yet — please call or WhatsApp us.'); return }
    setBusy(true)
    try {
      await rpc('submit_enquiry', {
        p: { name: f.name.trim(), phone: f.phone, email: f.email.trim(), city: f.city.trim(), requirement: f.requirement.trim(), species: f.species, est_cft: f.est_cft },
      })
      setDone({ name: f.name.trim().split(' ')[0], phone: f.phone.replace(/\D/g, '').slice(-10) })
      setF(EMPTY)
      setTouched(false)
    } catch (x) {
      setErr(errorText(x))
    } finally {
      setBusy(false)
    }
  }

  const contactNo = company.whatsapp || company.phone
  const show = (k: keyof Form) => touched && errors[k]

  return (
    <section id="enquiry" className="relative scroll-mt-20 overflow-hidden bg-[linear-gradient(160deg,#fff4e0_0%,#fbe3c0_45%,#f3cfa0_100%)] py-20 sm:py-28">
      <div className="pointer-events-none absolute inset-0 opacity-[0.12] mix-blend-multiply" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}landing/textures/teak_diff.webp)`, backgroundSize: '760px auto' }} />
      <div className="relative mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div>
          <SectionHeading eyebrow="Get a quote" title={<>Tell us what you’re building.</>}>
            Send your sizes or just the job — doors, frames, roof, furniture. We’ll work out the CFT, suggest the right species and call you back with today’s rate.
          </SectionHeading>
          <ul className="mt-6 space-y-2.5 text-[15px] font-medium text-teak-900/85">
            {['A call back within working hours', 'Sizes checked by our sawmill in-charge', 'No obligation — compare and decide'].map((t) => (
              <li key={t} className="flex items-center gap-2.5"><span className="grid size-5 place-items-center rounded-full bg-leaf-500 text-[11px] font-bold text-white">✓</span>{t}</li>
            ))}
          </ul>
          {contactNo && (
            <div className="mt-7 flex flex-wrap gap-3">
              <a href={whatsappLink(contactNo, 'Hello Maruthi Timber Depot, I need a quote for timber.')} target="_blank" rel="noreferrer" className="btn-leaf px-5 py-3"><MessageCircle className="size-4" /> WhatsApp us</a>
              {company.phone && <a href={`tel:${phoneLink(company.phone)}`} className="btn-ghost px-5 py-3"><Phone className="size-4" /> Call {company.phone}</a>}
            </div>
          )}
        </div>

        <div className="relative">
          <AnimatePresence mode="wait">
            {done ? (
              <motion.div key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="card relative overflow-hidden p-8 text-center sm:p-12">
                <Sawdust />
                <motion.div
                  initial={{ scale: 2.4, rotate: -24, opacity: 0 }}
                  animate={{ scale: 1, rotate: -8, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.1 }}
                  className="mx-auto grid size-36 place-items-center rounded-full border-[5px] border-double border-leaf-500 text-leaf-600"
                >
                  <svg viewBox="0 0 52 52" className="size-16">
                    <motion.path d="M14 27 l8 8 l17 -18" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.45, duration: 0.5 }} />
                  </svg>
                </motion.div>
                <p className="mt-3 text-xs font-extrabold uppercase tracking-[0.3em] text-leaf-600">Enquiry received</p>
                <h3 className="mt-3 font-display text-3xl font-semibold text-ink">Thank you, {done.name}!</h3>
                <p className="mx-auto mt-2 max-w-sm text-ink-soft">Our team will call you on <span className="num font-bold text-ink">{done.phone}</span> during working hours with sizes and today’s rate.</p>
                <button className="btn-ghost mt-6" onClick={() => setDone(null)}>Send another enquiry</button>
              </motion.div>
            ) : (
              <motion.form key="form" onSubmit={submit} noValidate initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="card p-5 sm:p-8">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Your name" error={show('name')}>
                    <input className="input" value={f.name} onChange={set('name')} autoComplete="name" placeholder="e.g. Ravi Kumar" />
                  </Field>
                  <Field label="Mobile number" error={show('phone')}>
                    <input className="input num" value={f.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" placeholder="98450 12345" />
                  </Field>
                  <Field label="Town / area (optional)">
                    <input className="input" value={f.city} onChange={set('city')} autoComplete="address-level2" placeholder="e.g. Kolar" />
                  </Field>
                  <Field label="E-mail (optional)" error={show('email')}>
                    <input className="input" value={f.email} onChange={set('email')} inputMode="email" autoComplete="email" placeholder="you@example.com" />
                  </Field>
                  <Field label="Timber">
                    <select className="input" value={f.species} onChange={set('species')}>
                      <option value="">Not sure — please advise</option>
                      {species.map((s) => <option key={s.id}>{s.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Approx. CFT (optional)" error={show('est_cft')}>
                    <input className="input num" value={f.est_cft} onChange={set('est_cft')} inputMode="decimal" placeholder="e.g. 25" />
                  </Field>
                </div>
                <Field label="What do you need?" error={show('requirement')} className="mt-4">
                  <textarea ref={reqRef} className="input min-h-[110px] resize-y" value={f.requirement} onChange={set('requirement')} placeholder={'e.g. Teak door frames 5″×3″ for 4 doors (7 ft × 3 ft), and 4″×2″ rafters 12 ft — 20 pcs'} />
                </Field>
                <AnimatePresence>
                  {err && (
                    <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-4 rounded-xl bg-ember-50 px-3.5 py-2.5 text-sm font-semibold text-ember-600" role="alert">
                      {err}
                    </motion.p>
                  )}
                </AnimatePresence>
                <button className="btn-primary mt-5 w-full py-3.5 text-base" disabled={busy}>
                  {busy ? <span className="size-5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Send className="size-4" />}
                  {busy ? 'Sending…' : 'Send enquiry'}
                </button>
                <p className="mt-3 text-center text-xs text-ink-mute">We only use your number to reply to this enquiry.</p>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  )
}

function Field({ label, error, children, className = '' }: { label: string; error?: string | false; children: React.ReactNode; className?: string }) {
  return (
    <label className={`field ${className}`}>
      <span className="label">{label}</span>
      {children}
      <AnimatePresence>
        {error && <motion.span initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-xs font-semibold text-ember-600">{error}</motion.span>}
      </AnimatePresence>
    </label>
  )
}

/** Wood shavings drifting down behind the success stamp. */
function Sawdust() {
  const bits = Array.from({ length: 26 }, (_, i) => i)
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {bits.map((i) => (
        <motion.span
          key={i}
          className="absolute top-[-10px] block rounded-[40%]"
          style={{
            left: `${(i * 37) % 100}%`,
            width: 6 + (i % 4) * 3,
            height: 3 + (i % 3) * 2,
            background: ['#e8b97a', '#d59a55', '#f3d3a3', '#c98a4a'][i % 4],
          }}
          initial={{ y: -20, rotate: 0, opacity: 0 }}
          animate={{ y: 420, rotate: 360 + i * 40, opacity: [0, 1, 1, 0] }}
          transition={{ duration: 2.2 + (i % 5) * 0.35, delay: (i % 9) * 0.08, ease: 'easeIn' }}
        />
      ))}
    </div>
  )
}
