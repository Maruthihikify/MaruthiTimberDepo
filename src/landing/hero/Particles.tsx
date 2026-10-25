import { useEffect, useRef, type MutableRefObject } from 'react'

export interface ParticleState {
  /** sawdust emitter in 0…1 stage coordinates, or null */
  spray: { x: number; y: number } | null
  /** 0…1 strength of the floating motes (they follow the light of each chapter) */
  motes: number
  /** render loop allowed (hero on screen, tab visible) */
  active: boolean
}

interface P { x: number; y: number; vx: number; vy: number; life: number; size: number; hue: number; spray: boolean }

/** Golden motes drifting in the light and teak sawdust thrown off the blade. Canvas 2D, ~0.3 ms/frame. */
export default function Particles({ state, mobile }: { state: MutableRefObject<ParticleState>; mobile: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const g = c.getContext('2d')!
    const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2)
    let W = 0, H = 0
    const resize = () => {
      const r = c.getBoundingClientRect()
      W = r.width
      H = r.height
      c.width = Math.round(W * dpr)
      c.height = Math.round(H * dpr)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(c)

    const motes: P[] = Array.from({ length: mobile ? 46 : 110 }, () => ({
      x: Math.random(), y: Math.random(), vx: (Math.random() - 0.3) * 0.006, vy: -0.004 - Math.random() * 0.01,
      life: Math.random(), size: 0.6 + Math.random() * 1.8, hue: 36 + Math.random() * 12, spray: false,
    }))
    const dust: P[] = []
    const maxDust = mobile ? 160 : 420
    let raf = 0
    let last = performance.now()
    let carry = 0

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame)
      const s = state.current
      if (!s.active) { last = t; return }
      const dt = Math.min(0.05, (t - last) / 1000)
      last = t
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.clearRect(0, 0, W, H)
      g.globalCompositeOperation = 'lighter'

      // motes
      const mk = s.motes
      if (mk > 0.01) {
        for (const m of motes) {
          m.x += (m.vx + Math.sin(t * 0.0004 + m.hue) * 0.002) * dt
          m.y += m.vy * dt
          m.life += dt * 0.35
          if (m.y < -0.05) { m.y = 1.05; m.x = Math.random() }
          if (m.x > 1.05) m.x = -0.05
          const tw = 0.45 + 0.55 * Math.sin(m.life * 2.2) ** 2
          const r = m.size * (W / 1400 + 0.6)
          const a = 0.55 * tw * mk
          const grd = g.createRadialGradient(m.x * W, m.y * H, 0, m.x * W, m.y * H, r * 3)
          grd.addColorStop(0, `hsla(${m.hue},95%,82%,${a})`)
          grd.addColorStop(1, `hsla(${m.hue},95%,70%,0)`)
          g.fillStyle = grd
          g.beginPath()
          g.arc(m.x * W, m.y * H, r * 3, 0, Math.PI * 2)
          g.fill()
        }
      }

      // sawdust
      if (s.spray) {
        carry += dt * (mobile ? 90 : 220)
        while (carry > 1 && dust.length < maxDust) {
          carry -= 1
          const sp = Math.random()
          dust.push({
            x: s.spray.x * W + (Math.random() - 0.5) * 8, y: s.spray.y * H,
            vx: -(120 + sp * 520), vy: -(160 + Math.random() * 520),
            life: 1, size: 0.8 + Math.random() * 2.2, hue: 30 + Math.random() * 10, spray: true,
          })
        }
      }
      g.globalCompositeOperation = 'source-over'
      for (let i = dust.length - 1; i >= 0; i--) {
        const d = dust[i]
        d.vy += 620 * dt
        d.vx *= 1 - 1.2 * dt
        d.vy *= 1 - 0.6 * dt
        d.x += d.vx * dt
        d.y += d.vy * dt
        d.life -= dt * 0.6
        if (d.life <= 0 || d.y > H + 20 || d.x < -20) { dust.splice(i, 1); continue }
        g.fillStyle = `hsla(${d.hue},62%,${70 + d.size * 6}%,${Math.min(1, d.life * 1.4)})`
        g.beginPath()
        g.ellipse(d.x, d.y, d.size, d.size * 0.6, Math.atan2(d.vy, d.vx), 0, Math.PI * 2)
        g.fill()
      }
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [state, mobile])

  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />
}
