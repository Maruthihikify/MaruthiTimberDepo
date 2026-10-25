import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { LockKeyhole, Menu, X } from 'lucide-react'
import { LogoMark } from './ui'

const LINKS = [
  { href: '#species', label: 'Species' },
  { href: '#live', label: 'Live stock' },
  { href: '#calculator', label: 'Calculator' },
  { href: '#services', label: 'Services' },
  { href: '#contact', label: 'Contact' },
]

export default function Nav({ name }: { name: string }) {
  const [solid, setSolid] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const on = () => setSolid(window.scrollY > 30)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    if (open) window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div
        className={`mx-auto mt-2 flex max-w-7xl items-center justify-between gap-3 rounded-2xl px-3 py-2 transition-all duration-500 sm:mt-3 sm:px-4 ${
          solid ? 'mx-2 bg-paper/80 shadow-[0_10px_40px_-18px_rgba(99,54,26,0.45)] ring-1 ring-line/70 backdrop-blur-xl sm:mx-4 xl:mx-auto' : 'bg-transparent'
        }`}
      >
        <a href="#top" className="flex min-w-0 items-center gap-2.5" aria-label={`${name} — home`}>
          <LogoMark size={38} className="shrink-0 drop-shadow-[0_4px_10px_rgba(110,63,30,0.35)] transition-transform duration-500 hover:scale-110" />
          <span className="min-w-0 leading-none">
            <span className={`block truncate font-display text-[17px] font-semibold tracking-tight transition-colors sm:text-lg ${solid ? 'text-teak-900' : 'text-[#fff7ea] [text-shadow:0_1px_12px_rgba(43,24,12,0.5)]'}`}>{name}</span>
            <span className={`mt-0.5 block text-[10px] font-bold uppercase tracking-[0.24em] transition-colors ${solid ? 'text-teak-600' : 'text-sun-300'}`}>Timber · Sawmill · Doors</span>
          </span>
        </a>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Sections">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${solid ? 'text-teak-900/80 hover:bg-teak-50 hover:text-teak-900' : 'text-[#fbe9cf] hover:bg-white/15 hover:text-white'}`}>
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <Link to="/login" className={`hidden items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition sm:inline-flex ${solid ? 'text-teak-800 hover:bg-teak-50' : 'text-[#fbe9cf] hover:bg-white/15'}`}>
            <LockKeyhole className="size-4" /> Staff login
          </Link>
          <a href="#enquiry" className="btn-primary hidden px-4 py-2 sm:inline-flex">Get a quote</a>
          <button
            className={`grid size-10 place-items-center rounded-xl ring-1 backdrop-blur lg:hidden ${solid ? 'bg-paper/80 text-teak-900 ring-line' : 'bg-white/12 text-white ring-white/30'}`}
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button className="absolute inset-0 bg-teak-900/30 backdrop-blur-sm" aria-label="Close menu" onClick={() => setOpen(false)} />
            <motion.nav
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
              className="absolute inset-y-0 right-0 flex w-[min(86vw,360px)] flex-col bg-canvas p-5 shadow-2xl"
              aria-label="Menu"
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-display text-lg font-semibold"><LogoMark size={30} /> Menu</span>
                <button className="grid size-10 place-items-center rounded-xl ring-1 ring-line" onClick={() => setOpen(false)} aria-label="Close menu"><X className="size-5" /></button>
              </div>
              <div className="mt-6 flex flex-col">
                {LINKS.map((l, i) => (
                  <motion.a
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 + i * 0.05 }}
                    className="border-b border-line py-4 font-display text-2xl font-semibold text-teak-900"
                  >
                    {l.label}
                  </motion.a>
                ))}
              </div>
              <div className="mt-auto grid gap-2">
                <a href="#enquiry" onClick={() => setOpen(false)} className="btn-primary py-3">Get a quote</a>
                <Link to="/login" className="btn-ghost py-3"><LockKeyhole className="size-4" /> Staff login</Link>
              </div>
            </motion.nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
