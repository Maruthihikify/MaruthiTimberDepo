// Maruthi Timber Depot — staff logins (Supabase Edge Function).
// Creating Auth users and resetting passwords needs the service key, which must never reach the
// browser. The app calls this with the signed-in user's token; only an active owner may use it.
//
// Deploy: npx supabase functions deploy admin-users --project-ref pozqgnihmzxjtpjioegb --use-api
import { createClient } from 'npm:@supabase/supabase-js@2.50.0'

const STAFF_DOMAIN = 'staff.maruthitimber.in'
const ROLES = ['owner', 'manager', 'accounts', 'sales', 'yard']

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

function loginToEmail(login: string) {
  const t = login.trim().toLowerCase()
  if (t.includes('@')) return t
  const digits = t.replace(/[\s+\-()]/g, '')
  if (/^(91)?[6-9]\d{9}$/.test(digits)) return `${digits.slice(-10)}@${STAFF_DOMAIN}`
  return `${t.replace(/[^a-z0-9._-]/g, '')}@${STAFF_DOMAIN}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: caller, error: authErr } = await admin.auth.getUser(token)
  if (authErr || !caller.user) return json({ error: 'Not signed in' }, 401)
  const { data: me } = await admin.from('profiles').select('id, full_name, role, active').eq('id', caller.user.id).maybeSingle()
  if (!me || !me.active || me.role !== 'owner') return json({ error: 'Only the owner can manage staff logins' }, 403)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'Invalid request' }, 400) }
  const action = String(body.action ?? '')
  const audit = (entity_id: string, summary: string) => admin.from('audit_log').insert({ user_id: me.id, action, entity: 'staff', entity_id, summary })

  try {
    if (action === 'create') {
      const login = String(body.login ?? '').trim()
      const password = String(body.password ?? '')
      const full_name = String(body.full_name ?? '').trim()
      const role = String(body.role ?? '')
      const phone = body.phone ? String(body.phone) : null
      if (login.length < 3) return json({ error: 'Enter a user name (3+ letters) or a mobile number' }, 400)
      if (password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400)
      if (!full_name) return json({ error: 'Enter the person’s name' }, 400)
      if (!ROLES.includes(role)) return json({ error: 'Choose a role' }, 400)
      const email = loginToEmail(login)
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } })
      if (created.error) return json({ error: /already/i.test(created.error.message) ? 'That user name is already taken' : created.error.message }, 400)
      const { error } = await admin.from('profiles').insert({ id: created.data.user.id, full_name, role, phone, login_email: email, active: true })
      if (error) { await admin.auth.admin.deleteUser(created.data.user.id); return json({ error: error.message }, 400) }
      await audit(created.data.user.id, `Created ${role} login ${email} for ${full_name}`)
      return json({ ok: true, email })
    }

    const userId = String(body.user_id ?? '')
    const { data: target } = await admin.from('profiles').select('*').eq('id', userId).maybeSingle()
    if (!target) return json({ error: 'Staff member not found' }, 404)

    if (action === 'reset_password') {
      const password = String(body.password ?? '')
      if (password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400)
      const { error } = await admin.auth.admin.updateUserById(userId, { password })
      if (error) return json({ error: error.message }, 400)
      await audit(userId, `Reset password for ${target.full_name}`)
      return json({ ok: true })
    }
    if (action === 'set_active') {
      const active = !!body.active
      if (userId === me.id && !active) return json({ error: 'You cannot switch off your own login' }, 400)
      await admin.auth.admin.updateUserById(userId, { ban_duration: active ? 'none' : '876000h' })
      await admin.from('profiles').update({ active }).eq('id', userId)
      await audit(userId, `${active ? 'Enabled' : 'Disabled'} login of ${target.full_name}`)
      return json({ ok: true })
    }
    if (action === 'set_role') {
      const role = String(body.role ?? '')
      if (!ROLES.includes(role)) return json({ error: 'Unknown role' }, 400)
      if (userId === me.id && role !== 'owner') return json({ error: 'You cannot remove your own owner role' }, 400)
      await admin.from('profiles').update({ role }).eq('id', userId)
      await audit(userId, `Changed role of ${target.full_name} to ${role}`)
      return json({ ok: true })
    }
    return json({ error: `Unknown action "${action}"` }, 400)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
