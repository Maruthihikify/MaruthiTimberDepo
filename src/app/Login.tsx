import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { motion } from 'motion/react'
import { ArrowLeft, Eye, EyeOff, LockKeyhole, UserRound } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { endGrainCanvas, plankUrlPersisted, SPECIES_TONES } from '../lib/wood'
import { RingSpinner } from '../components/Loader'
import { supabaseConfigured } from '../lib/supabase'

export default function Login() {
  const { signIn, session, profile } = useAuth()
  const nav = useNavigate()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const disc = useRef<HTMLDivElement>(null)

  useEffect(() => { if (session && profile) nav('/app', { replace: true }) }, [session, profile, nav])

  const wall = useMemo(() => plankUrlPersisted('login', { ...SPECIES_TONES.teak, seed: 21 }, 900, 1400, true), [])
  useEffect(() => {
    const c = endGrainCanvas({ ...SPECIES_TONES.teak, seed: 5, rings: 7 }, 420)
    c.className = 'h-full w-full rounded-full'
    disc.current?.replaceChildren(c)
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try {
      await signIn(login, password)
    } catch (x) {
      setErr((x as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden lg:block" style={{ backgroundImage: `url(${wall})`, backgroundSize: 'cover' }}>
        <div className="absolute inset-0 bg-gradient-to-br from-teak-300/25 via-transparent to-teak-800/45" />
        <div className="absolute inset-0 bg-[radial-gradient(800px_500px_at_30%_20%,rgba(255,226,170,0.55),transparent_60%)]" />
        <motion.div
          ref={disc}
          className="absolute left-1/2 top-[44%] size-[340px] -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_40px_80px_-20px_rgba(69,38,26,0.65),inset_0_0_0_10px_rgba(78,53,36,0.4)]"
          initial={{ rotate: -20, scale: 0.85, opacity: 0 }}
          animate={{ rotate: 0, scale: 1, opacity: 1 }}
          transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
        />
        <div className="absolute inset-x-0 bottom-0 p-12 text-teak-50">
          <p className="font-display text-4xl font-semibold leading-tight drop-shadow-[0_2px_12px_rgba(69,38,26,0.6)]">Every ring tells a story.<br />Every bill tells the truth.</p>
          <p className="mt-3 max-w-md text-sm font-medium text-teak-100 drop-shadow">Stock, sawmill, GST billing and accounts for Maruthi Timber Depot — measured to the last cubic foot.</p>
        </div>
      </div>

      <div className="relative flex items-center justify-center bg-canvas grain-bg px-5 py-10">
        <Link to="/" className="absolute left-5 top-5 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-teak-700"><ArrowLeft className="size-4" /> Website</Link>
        <motion.form
          onSubmit={submit}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
          className="card w-full max-w-md p-7 sm:p-9"
        >
          <div className="mb-7 flex items-center gap-3">
            <img src="/brand/logo-256.webp" alt="" className="size-12 drop-shadow" />
            <div>
              <p className="font-display text-xl font-semibold leading-tight">Maruthi Timber Depot</p>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teak-600">Staff sign in</p>
            </div>
          </div>
          {!supabaseConfigured && <p className="mb-4 rounded-xl bg-ember-50 p-3 text-sm text-ember-600">The app is not connected to the database yet (missing environment keys).</p>}
          <label className="field">
            <span className="label">User name or mobile number</span>
            <span className="relative">
              <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-mute" />
              <input className="input !pl-9" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} placeholder="e.g. counter or 98450 12345" autoFocus required />
            </span>
          </label>
          <label className="field mt-4">
            <span className="label">Password</span>
            <span className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-mute" />
              <input className="input !px-9" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-mute hover:text-ink">
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </span>
          </label>
          {err && <motion.p initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: [0, -6, 6, -3, 0] }} className="mt-4 rounded-xl bg-ember-50 px-3 py-2 text-sm font-semibold text-ember-600">{err}</motion.p>}
          <button className="btn-primary mt-6 w-full py-3 text-base" disabled={busy}>
            {busy ? <RingSpinner size={20} /> : null} Sign in
          </button>
          <p className="mt-5 text-center text-xs text-ink-mute">Forgot your password? Ask the owner to reset it from Settings → Team.</p>
        </motion.form>
      </div>
    </div>
  )
}
