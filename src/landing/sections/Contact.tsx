import { Link } from 'react-router'
import { Clock, LockKeyhole, Mail, MapPin, MessageCircle, Navigation, Phone } from 'lucide-react'
import { phoneLink, whatsappLink } from '../../lib/format'
import type { PublicCompany } from '../data'
import { LogoMark, SectionHeading, useInView } from '../ui'

export default function Contact({ company }: { company: PublicCompany }) {
  const [ref, seen] = useInView<HTMLDivElement>('0px 0px 300px 0px')
  const address = [company.address, company.city, company.state, company.pincode].filter(Boolean).join(', ')
  const rows = [
    { icon: MapPin, label: 'Yard address', value: company.address ? address : null, placeholder: 'Address will appear here' },
    { icon: Phone, label: 'Phone', value: company.phone ? [company.phone, company.alt_phone].filter(Boolean).join(' · ') : null, placeholder: 'Phone number will appear here', href: company.phone ? `tel:${phoneLink(company.phone)}` : undefined },
    { icon: Mail, label: 'E-mail', value: company.email, placeholder: 'E-mail will appear here', href: company.email ? `mailto:${company.email}` : undefined },
    { icon: Clock, label: 'Yard hours', value: company.opening_hours, placeholder: 'Hours will appear here' },
  ]
  const directions = company.map_query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(company.map_query)}` : null

  return (
    <>
      <section id="contact" className="relative scroll-mt-20 bg-canvas py-20 sm:py-28">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-2 lg:items-stretch">
          <div>
            <SectionHeading eyebrow="Visit the yard" title={<>Come see the wood<br className="hidden sm:block" /> before you buy it.</>}>
              Walk the racks, pick your boards and watch them cut. Our team will help you choose the right species for the job.
            </SectionHeading>
            <dl className="mt-8 grid gap-3">
              {rows.map((r) => (
                <div key={r.label} className="flex items-start gap-3.5 rounded-2xl bg-paper p-4 ring-1 ring-line">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-teak-50 text-teak-600"><r.icon className="size-5" /></span>
                  <div className="min-w-0">
                    <dt className="text-[11px] font-bold uppercase tracking-wider text-ink-mute">{r.label}</dt>
                    <dd className={`mt-0.5 break-words text-[15px] font-semibold ${r.value ? 'text-ink' : 'italic text-ink-mute'}`}>
                      {r.value ? (r.href ? <a href={r.href} className="hover:text-teak-700">{r.value}</a> : r.value) : r.placeholder}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>
            <div className="mt-5 flex flex-wrap gap-3">
              {(company.whatsapp || company.phone) && (
                <a href={whatsappLink(company.whatsapp || company.phone, 'Hello Maruthi Timber Depot')} target="_blank" rel="noreferrer" className="btn-leaf"><MessageCircle className="size-4" /> WhatsApp</a>
              )}
              {directions && <a href={directions} target="_blank" rel="noreferrer" className="btn-ghost"><Navigation className="size-4" /> Directions</a>}
            </div>
          </div>

          <div ref={ref} className="relative min-h-[360px] overflow-hidden rounded-[28px] ring-1 ring-line shadow-card">
            {company.map_query && seen ? (
              <iframe
                title="Map to Maruthi Timber Depot"
                src={`https://www.google.com/maps?q=${encodeURIComponent(company.map_query)}&output=embed`}
                className="absolute inset-0 h-full w-full border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            ) : (
              <div className="absolute inset-0 bg-[linear-gradient(135deg,#eaf3e4,#f6ead6)]">
                <svg className="absolute inset-0 h-full w-full opacity-70" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden>
                  <path d="M-10 210 C80 180 140 240 230 200 S360 140 420 170" stroke="#e9c48f" strokeWidth="18" fill="none" />
                  <path d="M120 -10 C140 80 100 160 160 310" stroke="#f4dcb4" strokeWidth="12" fill="none" />
                  <path d="M300 -10 C280 100 330 200 300 310" stroke="#f4dcb4" strokeWidth="9" fill="none" />
                  {Array.from({ length: 18 }).map((_, i) => (
                    <circle key={i} cx={(i * 71) % 400} cy={(i * 53) % 300} r={8 + (i % 4) * 4} fill="#a9dcb9" opacity=".55" />
                  ))}
                </svg>
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full">
                  <div className="animate-bounce"><LogoMark size={54} className="drop-shadow-[0_10px_14px_rgba(110,63,30,0.45)]" /></div>
                </div>
                <p className="absolute inset-x-0 bottom-5 text-center text-sm font-semibold text-ink-soft">Map will appear once the yard location is added</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <footer className="relative overflow-hidden bg-[linear-gradient(135deg,#7a4419_0%,#a95e1f_55%,#c9762a_100%)] text-teak-50">
        <div className="pointer-events-none absolute inset-0 opacity-25 mix-blend-multiply" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}landing/textures/teak_diff.webp)`, backgroundSize: '700px auto' }} />
        <div className="relative mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              <LogoMark size={46} />
              <div>
                <p className="font-display text-2xl font-semibold text-white">{company.name}</p>
                <p className="text-sm text-teak-100">{company.tagline}</p>
              </div>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-teak-100/90">
              Seasoned teak and Indian hardwoods, sawn to size and measured honestly — for homes, builders and craftsmen.
            </p>
            {company.gstin && <p className="mt-3 text-xs font-semibold tracking-wider text-teak-100">GSTIN {company.gstin}</p>}
          </div>
          <nav className="grid content-start gap-2 text-sm" aria-label="Footer">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-sun-300">Explore</p>
            {[['#species', 'Species'], ['#live', 'Live stock'], ['#calculator', 'CFT calculator'], ['#services', 'Services'], ['#enquiry', 'Get a quote']].map(([h, l]) => (
              <a key={h} href={h} className="w-fit text-teak-50 hover:text-white hover:underline">{l}</a>
            ))}
          </nav>
          <div className="grid content-start gap-2 text-sm">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-sun-300">For our team</p>
            <Link to="/login" className="inline-flex w-fit items-center gap-2 rounded-xl bg-white/15 px-4 py-2.5 font-semibold text-white ring-1 ring-white/25 backdrop-blur hover:bg-white/25">
              <LockKeyhole className="size-4" /> Staff login
            </Link>
          </div>
        </div>
        <div className="relative border-t border-white/15">
          <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-5 text-xs text-teak-100/80 sm:flex-row sm:justify-between sm:px-6">
            <p>© {new Date().getFullYear()} {company.name}. All rights reserved.</p>
            <p>Wood textures: Poly Haven (CC0)</p>
          </div>
        </div>
      </footer>
    </>
  )
}
