# Database business-rule tests

Runs every stock and money rule against a throwaway local Postgres 17 (never the live project):
Hoppus volumes, landed cost, sawmill yield costing, GST split / IGST, bill-discount spreading, credit limits,
counter discount cap, returns, bounced cheques, cancellations, role security and the public website functions.

```bash
# one-time: a scratch cluster on port 5499 with trust auth
initdb -D ./.pgtest -U postgres --auth=trust && pg_ctl -D ./.pgtest -o "-p 5499" start

psql -p 5499 -U postgres -f supabase/tests/00_supabase_stub.sql          # recreates database "mtd" with auth stubs
for f in supabase/migrations/*.sql; do psql -p 5499 -U postgres -d mtd -v ON_ERROR_STOP=1 -q -f "$f"; done
psql -p 5499 -U postgres -d mtd -q -f supabase/tests/10_business_scenarios.sql   # ends with "ALL SCENARIOS PASSED"
```
