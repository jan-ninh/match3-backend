# Deployment runbook (local preparation only)

No service or database has been deployed by this phase. Publishing, service creation and live configuration require separate approval.

## Architecture

The frontend is a static Vite SPA. Demo campaign/inventory stay on the device and work without the API. Account requests use a memory-only bearer access token; login/register/refresh/logout use an HttpOnly refresh cookie. The Node API owns account transitions, durable receipts, campaign finalization and leaderboard results in MongoDB transactions.

## Backend environment

Set these in the backend service, never in Vite. Do not upload existing local `.env` files.

| Variable | Production contract |
| --- | --- |
| `NODE_ENV` | Explicit `production`; Render detection rejects other modes. |
| `PORT` | Render-provided port; valid integer 1–65535 (local default 3000). Bind is `0.0.0.0`. |
| `MONGO_URI` | **Secret**, owner-controlled Atlas connection URI. No placeholders, disabled TLS or unacknowledged writes. |
| `DB_NAME` | Required explicit database name; overrides any database path in the URI. Letters, digits, underscore/hyphen only. |
| `CLIENT_BASE_URL` | Required exact HTTPS frontend origin(s), comma-separated if necessary. No paths, trailing slash or wildcard. Keep the allowlist minimal. |
| `ACCESS_JWT_SECRET` | **Secret**, cryptographically random, at least 32 bytes. No fallback in production; placeholder/repetitive values rejected. Length checks cannot prove entropy. |
| `ACCESS_TOKEN_TTL` | Default `15m`, maximum `1h`. |
| `REFRESH_TOKEN_TTL` | Default `7d`, maximum `30d`; must exceed access lifetime. |
| `COOKIE_SAME_SITE` | Required explicit `lax`, `strict` or `none`; select using the topology below. |
| `COOKIE_SECURE` | Production is always secure; explicit `false` rejected. Set `true` for clarity. `none` always requires Secure. |
| `TRUST_PROXY_HOPS` | Required explicit integer 0–5. Start with `1` behind Render's edge, verify the actual forwarding chain; never use unrestricted trust. |
| `SALT_ROUNDS` | Default 10; production range 10–15. |
| `ALLOW_STAGE_SKIP` | Omit or `0`. `1` is rejected in production; only development can enable it. |
| `JWT_ISSUER`, `JWT_AUDIENCE` | Optional stable identifiers; defaults `match3-api`, `match3-spa`. Changing these invalidates existing access tokens. |

Development can use loopback MongoDB and an ephemeral signing key; account gameplay still requires a replica set. `.env.example` contains examples/placeholders, not production credentials. `RENDER` is platform-provided, not an application secret.

## Database prerequisites

Use an owner-controlled MongoDB Atlas replica-set/sharded deployment with transaction support; standalone MongoDB is unsupported. Configure a dedicated database user with the necessary database read/write and collection/index permissions, and deliberately restrict network access to the chosen service's egress. Do not blindly open all IP addresses.

Before listening, startup connects with explicit `DB_NAME`, reads `hello` without a gameplay write, checks primary/session/transaction-capable topology, then creates the six authoritative collections and their declared indexes: users, refresh sessions, attempts, operation receipts, account campaign runs and best entries. Index initialization is additive: no `syncIndexes`, deletion or automatic legacy backfill. Historical duplicates may cause index creation to fail; review them separately rather than auto-repairing data.

A topology check does not prove every future transaction permission, feature-compatibility setting or failover condition. Runtime transactional commands retain fail-closed handling; there is no standalone non-transaction fallback. See [MongoDB transactions](https://www.mongodb.com/docs/manual/core/transactions/) and [hello](https://www.mongodb.com/docs/manual/reference/command/hello/).

## Render backend settings

For the separate backend repository, root directory is empty/repository root. Use the approved checkpoint/branch only after publication approval; keep auto-deploy disabled during controlled rollout.

- Node: `.node-version` pins **22.23.3**; engines require `>=22.18.0 <23`. Do not set a conflicting `NODE_VERSION` override.
- Install/build: `npm ci --include=dev && npm run build` (also `npm run render-build`).
- Start: `npm start` → `node dist/server.js`.
- Health check path: `/ready`.
- Enter the backend environment above, including exact frontend origin, secrets and known proxy topology.

Render terminates HTTPS at its edge; the API still explicitly issues Secure cookies in production. See [Node version selection](https://render.com/docs/node-version), [web services](https://render.com/docs/web-services), [environment variables](https://render.com/docs/environment-variables) and [health checks](https://render.com/docs/health-checks).

## Frontend settings and SPA routing

Use the separate frontend repo, root directory empty, Node 22.23.3, build `npm ci --include=dev && npm run build`, publish `dist`. `HOSTING.md` and the unimported `render.yaml` record the static settings. Creating/importing that Blueprint is a later deployment action even with automatic deploys disabled.

| Variable | Contract |
| --- | --- |
| `VITE_API_URL` | Required public API **origin**, e.g. `https://api.example.org`; no `/api` suffix, other path, query or credentials. Trailing slashes normalize. Missing/invalid values fail the build. |

HTTP loopback is permitted for isolated production-build testing. Explicit `/` selects an intentional same-origin API proxy; the static Blueprint does not provide such a proxy. Every Vite variable is public. API changes require a rebuild. Never put database/signing/session secrets in frontend variables.

Static hosting requires a **rewrite** `/*` → `/index.html` (200), preserving real asset files. Actual routes are `/`, `/game-map`, `/game-map/play-game?level=1`, `/game-map/leaderboard`, `/game-map/profile`; a rewrite does not create `/map` or `/profile` aliases. See [Render rewrites](https://render.com/docs/redirects-rewrites).

## Cookie / CORS / Origin matrix

| Topology | Frontend / API values | Cookie | Proxy |
| --- | --- | --- | --- |
| Local | `CLIENT_BASE_URL=http://127.0.0.1:5173`; `VITE_API_URL=http://127.0.0.1:3000` (preview origin uses port 4173 instead) | Secure false, SameSite lax; use the same hostname consistently | 0 |
| Separate default Render hosts | `https://app-name.onrender.com` / `https://api-name.onrender.com` | Secure true, SameSite none; third-party cookie restrictions may still prevent account restoration | Usually 1; verify chain |
| Preferred same-site custom domains | `https://app.example.org` / `https://api.example.org` | Secure true, SameSite lax; both HTTPS and same registrable domain | Usually 1; verify chain |

In each row `CLIENT_BASE_URL` is the exact frontend origin and `VITE_API_URL` the API origin. Cookies remain host-only, HttpOnly, path `/api/auth`, with matching clear attributes. Auth endpoints use credentials `include`; bearer-only private requests use `omit`. CORS allows only configured exact origins, with credentials, never `*`. Login/register/refresh/logout require an allowed Origin; missing/disallowed Origin fails. Do not weaken this CSRF boundary.

`onrender.com` appears in the [Public Suffix List](https://publicsuffix.org/list/public_suffix_list.dat), so separate default service hosts are cross-site. SameSite=None is necessary but cannot override browser third-party-cookie blocking. Prefer same-site custom domains for dependable account sessions; an intentional same-origin reverse proxy is another separately configured option. Do not work around cookie blocking with JavaScript refresh tokens or shared public-suffix cookies. See [cookie policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie). Hosted HTTPS/cookie behavior remains to be verified after approval.

## Startup, health and shutdown

Config errors name variables without printing values. Startup validates configuration, connects, checks topology and initializes indexes before serving. Failure exits non-zero with sanitized diagnostics. `/health` is lightweight process liveness; `/ready` is 200 only after prerequisites and a bounded database ping, otherwise 503. Both expose only booleans, no private data, and are non-cacheable. These are not account-operation probes.

SIGTERM/SIGINT enter one shutdown path, disable readiness, drain HTTP and scheduled work, then disconnect MongoDB. A 20-second deadline prevents indefinite shutdown; repeated signals do not duplicate cleanup. During startup there is no listening socket until prerequisites succeed.

## Future rollout order and human inputs

1. Review the dependency advisories and choose cookie/domain topology before live approval.
2. Supply owned Atlas URI/database, restricted database user/network permissions, random signing secret, exact frontend/API URLs and verified proxy count.
3. Approve publication and service creation separately. Configure backend/build/environment; confirm `/health` and `/ready`.
4. Configure frontend public API origin, static build and SPA rewrite, then approve its deployment.
5. Execute the smoke plan below on an explicitly designated test account. Record versions and outcomes.

No live credentials, account, service, database or URLs were inferred or tested in this phase.

## Future smoke plan (not executed)

| Check | Data effects |
| --- | --- |
| Demo loads without login; campaign works with API blocked; direct-route reload works | Local Guest save only |
| Register/login; access expiry followed by refresh; `/api/auth/me` shows correct owner | Creates test account / refresh sessions; refresh rotates session |
| Acknowledged account stage start, one WIN/LOSS, immediate result and confirmed save | Writes attempt, snapshot, receipt and applicable campaign state |
| Lost-response/reload reconciliation and duplicate same-operation retry | Existing receipt recovered; must not duplicate rewards/inventory/score |
| Canonical leaderboard and authenticated own rank | Read-only; completing stage 11 beforehand creates a finalized result/best entry |
| Optional stage 12 leaves finalized leaderboard result unchanged | Writes sandbox attempt only; needs an approved completed test campaign |
| Logout/revocation; another refresh rejected; Demo save preserved | Revokes refresh session |
| `/health` and `/ready`, then controlled backend-unavailable Demo check | Read-only health checks |

Use normal transitions or an explicitly approved isolated fixture to reach stage 11; never enable production stage skipping or mutate unknown live data for convenience.

## Rollback and safe failure

Keep the approved compatible code checkpoints and configuration record. Rollback needs separate approval and must preserve durable receipts, finalized results and existing data; do not reset the database or assume a pre-auth/pre-receipt version is compatible. Rotate/revoke compromised secrets/sessions deliberately. An unavailable backend must fail account authority explicitly while Demo remains playable; never label ambiguous account persistence successful.

## Dependency review gate

No upgrades were made here. Audits of committed lockfiles found backend **7** advisories (5 high, 1 moderate, 1 low), of which **4** are runtime (Mongoose, path-to-regexp, qs, body-parser); frontend **15** (11 high, 3 moderate, 1 low), with **6** reported in its production dependency graph. In the static frontend, only react-router among those six ships as application routing code; Vite/Rollup/PostCSS/nanoid/picomatch are build tooling despite dependency placement.

Review runtime high advisories before live rollout: same-major Mongoose 9.7.2+ and path-to-regexp 8.4+ are focused candidates, with qs/body-parser patches assessed through Express's graph. Fixed JSON body limits, server-defined routes and validated account inputs reduce specific exposure but do not prove immunity. React Router's SSR/RSC-specific advisories differ from this SPA, but applicable browser-routing advisories still need review. Same-major Vite 7 patches and toolchain patch/minor updates can be assessed separately; a Vite 8 migration is not required by this phase. Dev/test glob/parser advisories are not running API code. Audit counts are package advisories, not independent exploitable vulnerabilities. Clean `npm ci` resolves the lockfile, even where this local installed tree differs. Do not blindly apply `npm audit fix --force`.
