# Account authentication and local setup

This service issues a short-lived HS256 bearer JWT and a rotating opaque refresh cookie. The JWT contains only sub (account ID), sid (session family), type, issuer, audience and times. Private middleware verifies signature/algorithm/issuer/audience/expiry and checks the family is active. Logout/reuse revocation therefore also invalidates that family's existing access tokens.

## Configuration

Copy .env.example to ignored .env and replace placeholders. Never use a production database for tests. Development defaults to localhost MongoDB, match3_dev, localhost:5173 and an ephemeral random signing secret; set a stable random secret for repeatable development. Production requires MONGO_URI, DB_NAME, CLIENT_BASE_URL and a >=32-byte random ACCESS_JWT_SECRET. All configuration is validated in utils/env.ts; errors name settings without logging values. TTLs accept seconds or s/m/h/d suffixes: access default 15m (max 1h), refresh default 7d (max 30d, absolute family lifetime). bcrypt rounds default 10. NODE_ENV must be explicitly production on a hosted service.

CLIENT_BASE_URL is a comma-separated list of exact SPA origins, without trailing slash, wildcard or path. Production accepts HTTPS origins only. TRUST_PROXY_HOPS defaults to zero; configure only for a known trusted reverse-proxy topology. Mongoose uses DB_NAME and a bounded initial server selection; errors do not print URI/credentials.

## Endpoints

POST /api/auth/register, /login, /refresh return { accessToken, user }. GET /api/auth/me requires Bearer access and returns the same canonical safe user snapshot (id, email, username, avatar, powers, hearts, progress, activeStageRun, score, badges, statistics, playerLevel/EXP). No password hash or session digest is serialized. POST /api/auth/logout revokes the cookie's family and returns 204, also when already logged out.

Cookie-setting register/login and cookie-authenticated refresh/logout require an exact allowed Origin, including same-origin requests. Missing/opaque/disallowed Origin is rejected; command-line clients must supply the configured Origin. This protects login CSRF as well as renewal/logout. Private account routes accept only bearer tokens, not cookies, body IDs, headers or decoded JWTs.

Canonical private gameplay routes are described in [GAMEPLAY-CONTRACT.md](GAMEPLAY-CONTRACT.md): snapshot, acknowledged attempt start/terminal, earned reward claim and owner-scoped receipts. Avatar remains PATCH /api/user/avatar. Historical ID paths reject mismatches; obsolete game writes and arbitrary powers PATCH return 410. Legacy campaign writes are paused pending Slice 6. Top ten and health remain public. Account stage skipping requires NODE_ENV=development and explicit ALLOW_STAGE_SKIP=1; it never fabricates predecessor completion.

## Cookies, CORS and CSRF

Only the refresh token is a cookie; access JWTs are never cookies. Raw refresh values use 48 cryptographically random bytes and are inaccessible to JavaScript via HttpOnly. MongoDB stores SHA-256 digests only. Cookie is host-only with Path=/api/auth, absolute expiry and matching clear attributes. Secure is mandatory in production; secure cookies use the \_\_Secure- prefix. SameSite defaults to lax locally and none in production to support separate frontend/backend sites. Same-site production deployments should explicitly choose lax. SameSite=none requires Secure even locally. No live deployment topology is asserted here.

CORS grants credentials and authorization headers only to exact configured SPA origins; no wildcard. Cookie endpoints enforce Origin on the server rather than relying on CORS as authorization. For this browser SPA, strict Origin rejection is the CSRF boundary: hostile sites cannot set a trusted Origin, including form requests; private bearer tokens are not ambient credentials. This does not protect a compromised allowed origin/XSS. Separate-site refresh may be blocked by browser third-party-cookie policy; prefer same-site custom domains or a same-origin proxy if needed, rather than weakening Origin/cookie checks.

## Refresh concurrency and revocation

One session-family document has current digest, consumed digests, account, created/rotated/expiry/revocation times. Atomic compare-and-swap replaces the current digest and records the consumed digest. Reusing any retained consumed token revokes the family. Concurrent refreshes with the same cookie have one winner; the losing replay revokes the family. Frontend uses single-flight renewal; separate tabs may race and require sign-in again. Expiry is enforced in queries independently of eventual Mongo TTL cleanup. There is no replay grace period or silent retry of a lost refresh response.

## Validation and limits

npm test starts a fresh mongodb-memory-server process bound to localhost and an ephemeral HTTP port, sets test-only config before app import and never loads .env. npm run build runs tsc without recursively deleting dist. Node native TypeScript tests were validated on Node 24; Node 22 must support type stripping (22.18+). No backend lint script is configured.

Slice 5 adds transactional gameplay attempts/receipts and replaces arbitrary inventory writes; see GAMEPLAY-CONTRACT.md. Browser-reported outcomes are not cheat-proof. Development account play needs a MongoDB replica set. Campaign/leaderboard consolidation is deferred to Slice 6. Password reset/email verification, distributed rate limiting, account/session management UI, CSP and production operational monitoring are follow-ups. Login/register have a single-process IP limiter; it is not a distributed abuse-prevention system.

Security references: [OWASP CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html), [refresh replay/rotation rationale, RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14). This app is not an OAuth authorization server.
