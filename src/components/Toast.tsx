import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'

type Kind = 'success' | 'error' | 'info'
interface Toast { id: number; kind: Kind; title: string; body?: string }

let push: ((t: Omit<Toast, 'id'>) => void) | null = null
let seq = 1

export const toast = {
  success: (title: string, body?: string) => push?.({ kind: 'success', title, body }),
  error: (title: string, body?: string) => push?.({ kind: 'error', title, body }),
  info: (title: string, body?: string) => push?.({ kind: 'info', title, body }),
}

const styles: Record<Kind, { ring: string; icon: typeof Info; tint: string }> = {
  success: { ring: 'border-leaf-200', icon: CheckCircle2, tint: 'text-leaf-600 bg-leaf-50' },
  error: { ring: 'border-ember-100', icon: AlertTriangle, tint: 'text-ember-600 bg-ember-50' },
  info: { ring: 'border-sky-100', icon: Info, tint: 'text-sky-600 bg-sky-50' },
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([])
  useEffect(() => {
    push = (t) => {
      const id = seq++
      setItems((s) => [...s.slice(-3), { ...t, id }])
      setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), t.kind === 'error' ? 7000 : 4200)
    }
    return () => { push = null }
  }, [])
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-3 sm:items-end sm:pr-5 no-print">
      <AnimatePresence initial={false}>
        {items.map((t) => {
          const s = styles[t.kind]
          const Icon = s.icon
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border ${s.ring} bg-paper/95 p-3.5 shadow-lift backdrop-blur`}
              role="status"
            >
              <span className={`grid size-8 shrink-0 place-items-center rounded-xl ${s.tint}`}><Icon className="size-4.5" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-ink">{t.title}</p>
                {t.body && <p className="mt-0.5 text-[13px] leading-snug text-ink-soft">{t.body}</p>}
              </div>
              <button aria-label="Dismiss" className="text-ink-mute hover:text-ink" onClick={() => setItems((s2) => s2.filter((x) => x.id !== t.id))}>
                <X className="size-4" />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
