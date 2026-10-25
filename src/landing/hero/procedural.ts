// Procedural surfaces that photo scans can't provide: a freshly cross-cut log face (rings, sapwood, bark,
// drying checks, saw marks) and brushed saw-blade steel. Used by the hero stills and the calculator.

const yieldToBrowser = () => new Promise<void>((r) => setTimeout(r, 0))

// ── gradient noise ──
function makeNoise(seed: number) {
  const perm = new Uint16Array(512)
  const p = new Uint16Array(256)
  for (let i = 0; i < 256; i++) p[i] = i
  let s = (seed * 2654435761) >>> 0
  for (let i = 255; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0
    const j = s % (i + 1)
    const t = p[i]; p[i] = p[j]; p[j] = t
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]
  const gx = new Float32Array(256), gy = new Float32Array(256)
  for (let i = 0; i < 256; i++) { const a = (perm[i] / 256) * Math.PI * 2; gx[i] = Math.cos(a); gy[i] = Math.sin(a) }
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
  const n2 = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y)
    const xf = x - xi, yf = y - yi
    const X = xi & 255, Y = yi & 255
    const h00 = perm[X + perm[Y]], h10 = perm[X + 1 + perm[Y]], h01 = perm[X + perm[Y + 1]], h11 = perm[X + 1 + perm[Y + 1]]
    const d00 = gx[h00] * xf + gy[h00] * yf
    const d10 = gx[h10] * (xf - 1) + gy[h10] * yf
    const d01 = gx[h01] * xf + gy[h01] * (yf - 1)
    const d11 = gx[h11] * (xf - 1) + gy[h11] * (yf - 1)
    const u = fade(xf), v = fade(yf)
    return (d00 + (d10 - d00) * u + (d01 - d00 + (d11 - d10 - d01 + d00) * u) * v) * 1.4
  }
  const fbm = (x: number, y: number, oct = 4) => {
    let f = 0, a = 0.5, fr = 1
    for (let i = 0; i < oct; i++) { f += a * n2(x * fr, y * fr); fr *= 2.02; a *= 0.5 }
    return f
  }
  return { n2, fbm }
}

const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v)
const sstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t) }
function rgb(h: string): [number, number, number] {
  const v = parseInt(h.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}
const mix3 = (a: number[], b: number[], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

export interface LogFaceOptions {
  size: number
  seed?: number
  /** growth rings from pith to bark */
  rings?: number
  /** bark thickness as a fraction of the radius */
  bark?: number
  /** pale sapwood band width as a fraction of the radius */
  sapwood?: number
  heart?: string
  heartLate?: string
  sap?: string
  barkOuter?: string
  barkInner?: string
}

/**
 * A freshly cross-cut teak log face: golden heartwood with darker latewood, ring-porous earlywood
 * pores, a pale sapwood band, the thin inner bark and a fissured outer bark, an off-centre pith,
 * radial drying checks and the curved marks left by a circular cross-cut saw.
 * Returns colour (with transparent corners) and a height map for bump shading.
 */
/** Pure pixel renderer (no DOM) so it can run in a Web Worker. Returns RGBA colour and height bytes. */
export function logFacePixels(o: LogFaceOptions, onRows?: (done: number) => void) {
  const size = o.size
  const seed = o.seed ?? 5
  const rings = o.rings ?? 62
  const barkW = o.bark ?? 0.065
  const sapW = o.sapwood ?? 0.075
  const heart = rgb(o.heart ?? '#b47a40'), late = rgb(o.heartLate ?? '#7b4a22')
  const sap = rgb(o.sap ?? '#dcb984'), sapLate = mix3(sap, late, 0.32)
  const barkO = rgb(o.barkOuter ?? '#6d5a49'), barkI = rgb(o.barkInner ?? '#c6a175')
  const crack = rgb('#4a2d18')
  const { n2, fbm } = makeNoise(seed)

  const cd = new Uint8ClampedArray(size * size * 4)
  const hd = new Uint8ClampedArray(size * size * 4)

  // pith a little off-centre — trees grow faster on their sunny side
  const pithX = 0.07, pithY = -0.045
  const ecc = 0.09, eccDir = 2.3
  const checks: { a: number; inner: number; w: number }[] = []
  let cs = seed * 97 + 13
  const rnd = () => ((cs = (cs * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  const nChecks = 4 + Math.floor(rnd() * 3)
  for (let i = 0; i < nChecks; i++) checks.push({ a: rnd() * Math.PI * 2, inner: 0.35 + rnd() * 0.35, w: 0.006 + rnd() * 0.008 })
  checks.push({ a: rnd() * Math.PI * 2, inner: -1, w: 0.004 }) // small heart shake at the pith
  const sawCx = -3.4, sawCy = 0.55 // centre of the cross-cut blade's arcs

  // lookup tables for everything that depends only on an angle or on the ring number (≈3× faster)
  const AN = 4096
  const angIdx = (a: number) => (((a + Math.PI) / (Math.PI * 2)) * AN) | 0
  const edgeLUT = new Float32Array(AN + 1), barkLUT = new Float32Array(AN + 1), warpLUT = new Float32Array(AN + 1)
  for (let i = 0; i <= AN; i++) {
    const th = (i / AN) * Math.PI * 2 - Math.PI
    const ct = Math.cos(th), st = Math.sin(th)
    edgeLUT[i] = 0.985 - 0.012 * (fbm(ct * 3 + 7, st * 3 + 7, 3) + 0.5) - 0.006 * n2(th * 18, 3)
    barkLUT[i] = barkW * (0.85 + 0.35 * (fbm(ct * 5, st * 5, 2) + 0.5))
    warpLUT[i] = 0.035 * fbm(ct * 2.2 + 3, st * 2.2 + 3, 3) + ecc * Math.cos(th - eccDir)
  }
  const YR = 32
  const yearLUT = new Float32Array(Math.ceil(rings * 1.4 * YR) + 2)
  for (let i = 0; i < yearLUT.length; i++) yearLUT[i] = 0.55 * fbm((i / YR) * 0.21, seed, 2)
  const maxW = Math.max(...checks.map((k) => k.w)) + 0.06

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = (px + 0.5) / size * 2 - 1
      const y = (py + 0.5) / size * 2 - 1
      const i4 = (py * size + px) * 4
      const r = Math.hypot(x, y)
      const th = Math.atan2(y, x)
      const ai = angIdx(th)
      const edge = edgeLUT[ai]
      if (r > edge) { cd[i4 + 3] = 0; hd[i4 + 3] = 255; continue }
      const barkStart = edge - barkLUT[ai]
      let c: [number, number, number]
      let h = 0.55
      if (r > barkStart) {
        // outer bark: plates and fissures running around the circumference
        const k = (r - barkStart) / (edge - barkStart)
        const fiss = sstep(0.55, 0.85, Math.abs(n2(th * 46, k * 3)) * 1.6)
        const grit = n2(px * 0.35, py * 0.35) * 0.1
        const inner = 1 - sstep(0.0, 0.22, k)
        c = mix3(barkO, barkI, inner * 0.85)
        const shade = 0.82 + grit - fiss * 0.38
        c = [c[0] * shade, c[1] * shade, c[2] * shade]
        h = 0.45 + (1 - fiss) * 0.35 - inner * 0.1
      } else {
        // growth rings measured from the pith, wavy and slightly eccentric
        const qx = x - pithX, qy = y - pithY
        const qr = Math.hypot(qx, qy)
        const qa = Math.atan2(qy, qx)
        const cambium = barkStart - 0.004
        const wl = warpLUT[angIdx(qa)]
        const warp = 1 + wl * (qr < 0.6 ? 0.4 + qr : 1)
        // distance from the pith to the cambium along this direction (pith is off-centre)
        const cq = qx / (qr || 1), sq = qy / (qr || 1)
        const dot = pithX * cq + pithY * sq
        const toEdge = -dot + Math.sqrt(Math.max(dot * dot - (pithX * pithX + pithY * pithY) + cambium * cambium, 0.01))
        const rn = clamp((qr * warp) / toEdge)
        // uneven year widths: good and bad monsoons
        const yr = rn * rings
        const year = yr + yearLUT[(yr * YR) | 0] + 0.15 * n2(qa * 2, yr * 0.5)
        const t = year - Math.floor(year)
        const lateW = sstep(0.55, 0.9, t) * (1 - sstep(0.965, 1.0, t))
        // ring-porous earlywood: open pores show as fine dark dots right after each ring line
        const poreZone = 1 - sstep(0.0, 0.2, t)
        const pore = poreZone > 0 ? poreZone * sstep(0.55, 0.85, n2(px * 0.9, py * 0.9) * 0.5 + 0.5) : 0
        const sapK = sstep(1 - sapW - 0.02, 1 - sapW + 0.025, rn)
        const base = mix3(heart, sap, sapK)
        const lw = mix3(late, sapLate, sapK)
        c = mix3(base, lw, lateW * (0.75 - sapK * 0.35))
        if (pore > 0) c = mix3(c, late, pore * 0.45)
        // faint medullary rays and juvenile core
        const ray = sstep(0.86, 0.98, Math.abs(n2(qa * 140, qr * 3)))
        if (ray > 0) c = [c[0] * (1 + 0.048 * ray), c[1] * (1 + 0.036 * ray), c[2] * (1 + 0.024 * ray)]
        if (qr < 0.03) c = mix3(c, late, 0.8 - qr * 18)
        // oxidised, slightly darker rim and gentle stains
        const stain = fbm(x * 2.2 + 11, y * 2.2 + 4, 2)
        // circular cross-cut saw marks: concentric arcs from a far centre + torn fibres
        const sd = Math.hypot(x - sawCx, y - sawCy)
        const mark = Math.sin(sd * 210 + n2(x * 6, y * 6) * 1.5) * 0.5 + 0.5
        const tear = n2(px * 0.25, py * 0.06) * 0.04
        const shade = (0.96 + stain * 0.12 - sstep(0.85, 1, rn) * 0.06) * (1 + (mark - 0.5) * 0.06 + tear)
        c = [c[0] * shade, c[1] * shade, c[2] * shade]
        h = 0.55 + (mark - 0.5) * 0.12 - pore * 0.1 - lateW * 0.03
        // drying checks run from the bark toward the pith and taper
        for (const k of checks) {
          let da0 = Math.abs(((qa - k.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
          if (da0 * qr > maxW) continue
          const jag = n2(qr * 22, k.a * 5) * 0.03
          da0 = Math.abs(((qa - k.a - jag + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
          const da = da0 * qr
          const inside = k.inner < 0 ? sstep(0.12, 0.0, qr) : sstep(k.inner, 1.0, rn)
          const w = k.w * inside
          if (w > 0 && da < w) {
            const depth = 1 - da / w
            c = mix3(c, crack, 0.55 + depth * 0.35)
            h = 0.12 + (1 - depth) * 0.3
          }
        }
      }
      cd[i4] = clamp(c[0], 0, 255); cd[i4 + 1] = clamp(c[1], 0, 255); cd[i4 + 2] = clamp(c[2], 0, 255); cd[i4 + 3] = 255
      const hv = clamp(h, 0, 1) * 255
      hd[i4] = hd[i4 + 1] = hd[i4 + 2] = hv; hd[i4 + 3] = 255
    }
    if (onRows && (py & 63) === 63) onRows(py + 1)
  }
  return { size, color: cd, height: hd }
}

/** Same face drawn into canvases on the main thread (small sizes only — prefer the worker for big ones). */
export async function logFaceCanvases(o: LogFaceOptions) {
  await yieldToBrowser()
  const px = logFacePixels(o)
  const mk = (data: Uint8ClampedArray) => {
    const c = document.createElement('canvas')
    c.width = c.height = px.size
    c.getContext('2d')!.putImageData(new ImageData(data, px.size, px.size), 0, 0)
    return c
  }
  return { color: mk(px.color), height: mk(px.height) }
}

/** Brushed saw-plate steel: concentric grinding lines, a faint etched maker ring, slight heat tint. */
export function brushedSteelCanvases(size: number, label: string) {
  const color = document.createElement('canvas')
  const rough = document.createElement('canvas')
  color.width = color.height = rough.width = rough.height = size
  const cc = color.getContext('2d')!, rc = rough.getContext('2d')!
  const ci = cc.createImageData(size, size), ri = rc.createImageData(size, size)
  const { n2 } = makeNoise(31)
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = (px + 0.5) / size * 2 - 1, y = (py + 0.5) / size * 2 - 1
      const r = Math.hypot(x, y)
      const a = Math.atan2(y, x)
      const lines = n2(r * 420, a * 1.2) * 0.5 + n2(r * 1300, a * 3) * 0.25
      const blotch = n2(x * 3, y * 3) * 0.05
      const tint = sstep(0.55, 0.75, r) * (1 - sstep(0.75, 0.9, r)) * 0.05 // faint straw heat tint
      const v = 196 + lines * 22 + blotch * 255
      const i = (py * size + px) * 4
      ci.data[i] = clamp(v + tint * 255, 0, 255)
      ci.data[i + 1] = clamp(v + tint * 120, 0, 255)
      ci.data[i + 2] = clamp(v + 6 - tint * 60, 0, 255)
      ci.data[i + 3] = 255
      const rv = clamp(0.3 + lines * 0.14 + Math.abs(blotch) * 0.6, 0.12, 0.6) * 255
      ri.data[i] = ri.data[i + 1] = ri.data[i + 2] = rv
      ri.data[i + 3] = 255
    }
  }
  cc.putImageData(ci, 0, 0)
  rc.putImageData(ri, 0, 0)
  // etched maker's ring
  cc.save()
  cc.translate(size / 2, size / 2)
  cc.fillStyle = 'rgba(120,96,70,0.55)'
  cc.font = `600 ${Math.round(size * 0.032)}px Manrope, system-ui, sans-serif`
  cc.textAlign = 'center'
  const radius = size * 0.31
  const chars = label.split('')
  const step = (Math.PI * 2 * 0.62) / chars.length
  chars.forEach((ch, i) => {
    cc.save()
    cc.rotate(-Math.PI * 0.81 + i * step)
    cc.translate(0, -radius)
    cc.fillText(ch, 0, 0)
    cc.restore()
  })
  cc.strokeStyle = 'rgba(120,96,70,0.35)'
  cc.lineWidth = size * 0.003
  cc.beginPath(); cc.arc(0, 0, size * 0.27, 0, Math.PI * 2); cc.stroke()
  cc.beginPath(); cc.arc(0, 0, size * 0.35, 0, Math.PI * 2); cc.stroke()
  cc.restore()
  return { color, rough }
}
