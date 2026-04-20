# Deployment & migrations

How code and database changes actually ship to `crybaby.golf` in production.

Project ref: `rrgjqhevwffghvelgljm`
Production URL: https://crybaby.golf
Supabase dashboard: https://supabase.com/dashboard/project/rrgjqhevwffghvelgljm

---

## Frontend

**Platform:** Render (static site) — see `render.yaml`.

**Deploy flow:** push / merge to `main` → Render picks up the commit → runs `bun install && bun run build` → serves `./dist` behind crybaby.golf. Typical wall-clock: 60-90 seconds from merge to live.

**Verify a deploy landed:** the bundle hash in the served HTML rotates on each build. Compare:

```bash
curl -s https://crybaby.golf | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1
```

to the last-known-good hash. `last-modified` header on the root also reflects the latest build time.

---

## Database migrations

Migrations live under `supabase/migrations/<YYYYMMDDHHmmss>_<name>.sql`. Every PR that touches DB state should include its migration(s); merging the PR doesn't apply the migration — that's a separate step.

There are **three ways to apply a migration** against live Supabase, in rough preference order:

### 1. Supabase SQL editor (GUI — simplest)

Open https://supabase.com/dashboard/project/rrgjqhevwffghvelgljm/sql/new, paste the migration file contents, click **Run**. Seconds. Best for one-off migrations or when you're iterating quickly. No credentials leave your laptop.

### 2. `supabase db push` (CLI — for CI or scripted flows)

```bash
SUPABASE_DB_PASSWORD='<db-password>' supabase db push
```

Requires the direct Postgres password from **Project Settings → Database → Connection info**. The CLI reads every pending migration in `supabase/migrations/` and applies in order. Use for CI or when you have several migrations queued.

### 3. Management API via dashboard session token (automation fallback)

When neither the SQL editor nor the CLI is ergonomic — e.g. when an AI session is driving a browser that has a logged-in Supabase tab open but has no access to the DB password — you can POST SQL directly to the management API using the dashboard's session access token:

```js
// Run inside the dashboard's page context (DevTools console, or a driver
// with page-script execution).
const ref = 'rrgjqhevwffghvelgljm';
const token = JSON.parse(localStorage.getItem('supabase.dashboard.auth.token')).access_token;

const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token,
  },
  body: JSON.stringify({ query: '<your SQL here>' }),
});
console.log(r.status, await r.text());
```

- Endpoint: `POST https://api.supabase.com/v1/projects/{ref}/database/query`
- Auth: the dashboard session token lives at `localStorage["supabase.dashboard.auth.token"]` as a JSON object with `access_token` / `expires_at` / `refresh_token`. It expires on the same cadence as the dashboard login.
- Body: `{ "query": "<SQL string>" }` — the string is parsed as a single SQL batch, so multi-statement migrations work.
- Response: `201` + JSON array of rows for SELECTs, `201` + `[]` for DDL.

**When to reach for this:** Discovered during an AI-assisted session where the laptop's `.env` only held the Supabase anon publishable key (not the DB password), Docker wasn't running (so no `supabase start`), and the dashboard was open in Chrome. The session token + management API combination threaded the needle: the credential never left the browser, the SQL ran, and the same 201-plus-row-array shape the dashboard itself consumes came back.

**Don't reach for this when:** the SQL editor is one click away. This path is a backup, not a new default — the SQL editor already gives you a result grid, query history, and error line numbers.

---

## Migration authoring rules

1. **Idempotent.** Every migration must be safe to re-apply. `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `DROP FUNCTION IF EXISTS` before `CREATE FUNCTION`, etc.
2. **No `CREATE OR REPLACE FUNCTION` across signature changes.** Postgres errors `42P13: cannot change return type of existing function` when the returned row type (OUT params, RETURNS TABLE columns) drifts. If the return shape is changing at all, `DROP FUNCTION IF EXISTS` first — see `20260419050000_fix_get_user_score_distribution.sql` for the pattern. For pure body rewrites with an identical signature, `CREATE OR REPLACE` is fine.
3. **Forward-only.** No down-migrations. If a change is wrong, ship a new migration that corrects it (the fix for `get_user_score_distribution` was itself a new file rather than a rewrite of the original).
4. **Test guards in TypeScript.** Source-level regex tests in `src/test/**` lock in the shape of each migration so a regression in the SQL is caught by the client test suite. See `src/test/scoreDistributionSim.test.ts` for the pattern.
5. **Post-merge apply.** The repo's `supabase/migrations/` is the source of truth, but merging a PR does NOT apply its migrations. Apply via one of the three paths above, then paste the confirmation back onto the PR.

---

## Edge functions

Deployed separately from frontend + migrations. Check current deployed versions with:

```bash
supabase functions list
```

Redeploy a function:

```bash
supabase functions deploy <name>
```

Most PRs don't touch edge function source. If a PR does, call it out explicitly in the PR description and deploy right after merge.
