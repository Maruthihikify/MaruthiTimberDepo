import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, ChevronDown, Search } from 'lucide-react'

export interface Option {
  value: string
  label: string
  hint?: ReactNode
  keywords?: string
  right?: ReactNode
  disabled?: boolean
}

/** Searchable select that works with keyboard and touch. */
export function Combobox({ value, onChange, options, placeholder = 'Select…', emptyText = 'Nothing found', footer, className = '', autoFocus }: {
  value: string | null
  onChange: (v: string) => void
  options: Option[]
  placeholder?: string
  emptyText?: string
  footer?: (q: string, close: () => void) => ReactNode
  className?: string
  autoFocus?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const selected = options.find((o) => o.value === value)

  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return options.slice(0, 80)
    const words = t.split(/\s+/)
    return options.filter((o) => {
      const hay = `${o.label} ${o.keywords ?? ''}`.toLowerCase()
      return words.every((w) => hay.includes(w))
    }).slice(0, 80)
  }, [q, options])

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  useEffect(() => { setActive(0) }, [q, open])
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 10) }, [open])
  useEffect(() => { if (autoFocus) setOpen(true) }, [autoFocus])

  const choose = (o: Option) => {
    if (o.disabled) return
    onChange(o.value)
    setOpen(false)
    setQ('')
  }

  return (
    <div ref={box} className={`relative ${className}`}>
      <button type="button" className="input flex items-center justify-between gap-2 text-left" onClick={() => setOpen((v) => !v)}>
        <span className={`min-w-0 truncate ${selected ? 'text-ink' : 'text-ink-mute/80'}`}>{selected ? selected.label : placeholder}</span>
        <ChevronDown className={`size-4 shrink-0 text-ink-mute transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className="absolute left-0 right-0 z-50 mt-1.5 min-w-[260px] overflow-hidden rounded-2xl border border-line bg-paper shadow-lift"
          >
            <div className="relative border-b border-line p-2">
              <Search className="pointer-events-none absolute left-4.5 top-1/2 size-4 -translate-y-1/2 text-ink-mute" />
              <input
                ref={input}
                className="input input-sm !pl-8"
                value={q}
                placeholder="Type to search…"
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(list.length - 1, a + 1)) }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
                  if (e.key === 'Enter') { e.preventDefault(); if (list[active]) choose(list[active]) }
                  if (e.key === 'Escape') setOpen(false)
                }}
              />
            </div>
            <ul className="max-h-72 overflow-y-auto p-1.5">
              {list.length === 0 && <li className="px-3 py-4 text-center text-sm text-ink-mute">{emptyText}</li>}
              {list.map((o, i) => (
                <li key={o.value}>
                  <button
                    type="button"
                    disabled={o.disabled}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(o)}
                    className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors disabled:opacity-40 ${i === active ? 'bg-teak-50' : ''}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink">{o.label}</span>
                      {o.hint && <span className="block truncate text-xs text-ink-soft">{o.hint}</span>}
                    </span>
                    {o.right}
                    {o.value === value && <Check className="size-4 shrink-0 text-teak-600" />}
                  </button>
                </li>
              ))}
            </ul>
            {footer && <div className="border-t border-line bg-cream/50 p-2">{footer(q, () => setOpen(false))}</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
