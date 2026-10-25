import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, animate, motion, useInView } from 'motion/react'
import { Search, X } from 'lucide-react'
import { RingSpinner } from './Loader'

export function PageHeader({ title, subtitle, actions, icon }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        {icon && <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teak-100 to-teak-200 text-teak-700 shadow-card">{icon}</div>}
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-ink-soft">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Number that rolls up to its value when it scrolls into view. */
export function CountUp({ value, format = (n) => Math.round(n).toLocaleString('en-IN'), duration = 1.1 }: { value: number; format?: (n: number) => string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-20px' })
  const last = useRef(0)
  useEffect(() => {
    if (!inView || !ref.current) return
    const node = ref.current
    const c = animate(last.current, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => { node.textContent = format(v) },
    })
    last.current = value
    return () => c.stop()
  }, [inView, value, duration, format])
  return <span ref={ref} className="num">{format(0)}</span>
}

const tones = {
  teak: 'from-teak-50 to-white text-teak-700',
  leaf: 'from-leaf-50 to-white text-leaf-600',
  sky: 'from-sky-50 to-white text-sky-600',
  ember: 'from-ember-50 to-white text-ember-600',
  sun: 'from-sun-100 to-white text-sun-500',
  plum: 'from-plum-100 to-white text-plum-500',
} as const

export function Stat({ label, value, format, icon, tone = 'teak', hint, delay = 0, onClick }: {
  label: string; value: number; format?: (n: number) => string; icon?: ReactNode; tone?: keyof typeof tones; hint?: ReactNode; delay?: number; onClick?: () => void
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
      className={`card card-hover group relative overflow-hidden bg-gradient-to-br p-4 text-left sm:p-5 ${tones[tone]} ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    >
      <span className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-current opacity-[0.06] transition-transform duration-500 group-hover:scale-125" />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">{label}</span>
        {icon && <span className="grid size-8 place-items-center rounded-xl bg-white/80 shadow-sm">{icon}</span>}
      </div>
      <div className="mt-2 font-display text-[26px] font-semibold leading-none tracking-tight text-ink sm:text-[30px]">
        <CountUp value={value} format={format} />
      </div>
      {hint && <div className="mt-2 text-xs font-medium text-ink-soft">{hint}</div>}
    </motion.button>
  )
}

const chipTone: Record<string, string> = {
  green: 'bg-leaf-50 text-leaf-600 ring-1 ring-leaf-200',
  amber: 'bg-sun-100 text-sun-500 ring-1 ring-sun-300/60',
  red: 'bg-ember-50 text-ember-600 ring-1 ring-ember-100',
  blue: 'bg-sky-50 text-sky-600 ring-1 ring-sky-100',
  brown: 'bg-teak-50 text-teak-700 ring-1 ring-teak-200',
  grey: 'bg-cream text-ink-soft ring-1 ring-line',
  plum: 'bg-plum-100 text-plum-500 ring-1 ring-plum-100',
}
export function Chip({ tone = 'grey', children, dot }: { tone?: keyof typeof chipTone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`chip ${chipTone[tone]}`}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

export function StatusChip({ status, docType, due }: { status: string; docType?: string; due?: number }) {
  if (status === 'cancelled') return <Chip tone="red">Cancelled</Chip>
  if (docType === 'quotation') {
    if (status === 'converted') return <Chip tone="green">Converted</Chip>
    if (status === 'expired') return <Chip tone="grey">Expired</Chip>
    return <Chip tone="blue" dot>Open</Chip>
  }
  if (docType === 'credit_note') return <Chip tone="plum">Return</Chip>
  if (due !== undefined) {
    if (due <= 0.5) return <Chip tone="green">Paid</Chip>
    return <Chip tone="amber" dot>Due</Chip>
  }
  return <Chip tone="green">Posted</Chip>
}

export function Empty({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="mb-1 grid size-14 place-items-center rounded-2xl bg-teak-50 text-teak-500">{icon ?? <RingSpinner size={30} className="!animate-none" />}</div>
      <p className="font-display text-lg font-semibold text-ink">{title}</p>
      {body && <p className="max-w-sm text-sm text-ink-soft">{body}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2.5 p-4">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-11" style={{ opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  )
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; count?: number }[] }) {
  return (
    <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1">
      <div className="inline-flex gap-1 rounded-2xl border border-line bg-cream/70 p-1">
        {items.map((it) => (
          <button
            key={it.value}
            onClick={() => onChange(it.value)}
            className={`relative whitespace-nowrap rounded-xl px-3.5 py-1.5 text-sm font-semibold transition-colors ${value === it.value ? 'text-teak-800' : 'text-ink-soft hover:text-ink'}`}
          >
            {value === it.value && <motion.span layoutId={`tab-${items.map((i) => i.value).join()}`} className="absolute inset-0 rounded-xl bg-paper shadow-card" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            <span className="relative flex items-center gap-1.5">
              {it.label}
              {it.count !== undefined && <span className="num rounded-full bg-teak-100 px-1.5 text-[10px] text-teak-700">{it.count}</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function SearchBox({ value, onChange, placeholder = 'Search…', className = '' }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <label className={`relative block ${className}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-mute" />
      <input className="input !pl-9" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {value && (
        <button type="button" aria-label="Clear" onClick={() => onChange('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-mute hover:text-ink">
          <X className="size-4" />
        </button>
      )}
    </label>
  )
}

/** Centered modal on desktop, bottom sheet on phones. */
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = prev }
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6">
          <motion.div className="absolute inset-0 bg-teak-900/35 backdrop-blur-[3px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            className={`relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-paper shadow-lift sm:rounded-3xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}
          >
            <div className="flex items-center justify-between gap-3 border-b border-line bg-gradient-to-r from-teak-50 to-paper px-5 py-4">
              <h2 className="font-display text-lg font-semibold">{title}</h2>
              <button onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full text-ink-soft hover:bg-teak-100 hover:text-ink"><X className="size-4.5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-cream/50 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

export function Confirm({ open, onClose, onConfirm, title, body, confirmLabel = 'Confirm', danger, needReason, busy }: {
  open: boolean; onClose: () => void; onConfirm: (reason: string) => void; title: string; body?: ReactNode; confirmLabel?: string; danger?: boolean; needReason?: boolean; busy?: boolean
}) {
  const [reason, setReason] = useState('')
  useEffect(() => { if (open) setReason('') }, [open])
  return (
    <Modal open={open} onClose={onClose} title={title} footer={
      <>
        <button className="btn-ghost" onClick={onClose}>Back</button>
        <button className={danger ? 'btn bg-ember-500 text-white hover:bg-ember-600' : 'btn-primary'} disabled={busy || (needReason && reason.trim().length < 3)} onClick={() => onConfirm(reason.trim())}>
          {busy && <RingSpinner size={16} />} {confirmLabel}
        </button>
      </>
    }>
      {body && <div className="text-sm text-ink-soft">{body}</div>}
      {needReason && (
        <label className="field mt-4">
          <span className="label">Reason (kept in the audit trail)</span>
          <textarea className="input min-h-20" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        </label>
      )}
    </Modal>
  )
}

export function Field({ label, children, hint, className = '' }: { label: ReactNode; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={`field ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-ink-mute">{hint}</span>}
    </label>
  )
}

/** Segmented control */
export function Segmented<T extends string>({ value, onChange, items, size = 'md' }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; icon?: ReactNode }[]; size?: 'sm' | 'md' }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl border border-line bg-cream/60 p-1">
      {items.map((it) => (
        <button
          type="button"
          key={it.value}
          onClick={() => onChange(it.value)}
          className={`flex items-center gap-1.5 rounded-lg font-semibold transition-all ${size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'} ${value === it.value ? 'bg-paper text-teak-800 shadow-card' : 'text-ink-soft hover:text-ink'}`}
        >
          {it.icon}
          {it.label}
        </button>
      ))}
    </div>
  )
}

export function Money({ value, className = '', strong }: { value: number; className?: string; strong?: boolean }) {
  const n = Number(value) || 0
  return (
    <span className={`num whitespace-nowrap ${strong ? 'font-bold' : ''} ${className}`}>
      {n < 0 ? '−' : ''}₹{Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(Math.round(Math.abs(n) * 100) / 100) ? 0 : 2, maximumFractionDigits: 2 })}
    </span>
  )
}

/** Thin progress bar (credit usage, yield, stock level) */
export function Meter({ value, max, tone = 'teak', className = '' }: { value: number; max: number; tone?: 'teak' | 'leaf' | 'ember' | 'sun' | 'sky'; className?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  const color = { teak: 'from-teak-300 to-teak-500', leaf: 'from-leaf-300 to-leaf-500', ember: 'from-ember-400 to-ember-500', sun: 'from-sun-300 to-sun-500', sky: 'from-sky-400 to-sky-500' }[tone]
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-cream ${className}`}>
      <motion.div className={`h-full rounded-full bg-gradient-to-r ${color}`} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }} />
    </div>
  )
}

export function Section({ title, action, children, className = '', bodyClass = '' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={`card overflow-hidden ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-line/80 px-4 py-3 sm:px-5">
          <h3 className="font-display text-[17px] font-semibold text-ink">{title}</h3>
          {action}
        </div>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  )
}

/** Debounced value */
export function useDebounced<T>(v: T, ms = 220) {
  const [d, setD] = useState(v)
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms)
    return () => clearTimeout(t)
  }, [v, ms])
  return d
}

export function useMediaQuery(q: string) {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q)
    const f = () => setM(mq.matches)
    mq.addEventListener('change', f)
    return () => mq.removeEventListener('change', f)
  }, [q])
  return m
}
