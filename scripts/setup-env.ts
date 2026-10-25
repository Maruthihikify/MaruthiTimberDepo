/**
 * Writes .env.local with the project URL and the public (publishable/anon) key, read through the
 * logged-in Supabase CLI. The secret key is never written anywhere.
 *   npx vite-node scripts/setup-env.ts
 */
import { writeFileSync } from 'node:fs'
import { apiKeys, SUPABASE_URL } from './supabase-admin'

const { publishable } = apiKeys()
if (!publishable) throw new Error('Could not read the publishable key — run `npx supabase login` first.')
writeFileSync('.env.local', `VITE_MTD_SUPABASE_URL=${SUPABASE_URL}\nVITE_MTD_SUPABASE_ANON_KEY=${publishable}\n`)
console.log('Wrote .env.local for', SUPABASE_URL)
