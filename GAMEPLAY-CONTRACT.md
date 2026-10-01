# Account gameplay integrity contract

Private game commands require Slice 4 bearer identity. They use MongoDB snapshot transactions with majority commits: User gameplay state, durable attempt, operation receipt canonical campaign state and finalized best-result projection commit together. Transactions execute sequential queries; no external effects occur inside the retryable callback. An isolated single-node replica set is used in tests. A standalone MongoDB fails closed (503), without non-atomic fallback. Local/hosted configuration must support transactions; no live database was inspected. See [MongoDB transactions](https://www.mongodb.com/docs/manual/core/transactions/) and [Mongoose transaction handling](https://mongoosejs.com/docs/transactions.html).

## API

GET /api/auth/me and /api/game/snapshot share services/currentUser.ts. Account revision, run ID, rules/campaign version, sequential frontier, active attempt binding, inventory, hearts, score/EXP and pending earned rewards extend the existing safe identity/profile DTO. No board is serialized.

POST /api/game/attempts/start accepts operationId (UUID), expectedRevision, stageNumber. POST /api/game/attempts/terminal accepts the same command identity plus attemptId, outcome WIN/LOSS/ABANDON and an engine-observation usage list [{id: positive integer, power: bomb|laser|extraShuffle}]. Duplicate IDs/overdraw are rejected. POST /api/game/rewards/claim accepts operationId, expectedRevision, attemptId and a canonical power. POST /api/game/new-run accepts operationId and expectedRevision; without an active attempt it explicitly resets account progress, score and inventory, rotates run identity, preserves meta/EXP/hearts/stats and completed best results. It uses a durable NEW_RUN receipt with attemptId=null. POST /api/game/legacy-abandon explicitly closes a pre-migration interrupted stage with a durable receipt. All command bodies are strict; supplied owner IDs/boosters/quantities cannot establish authority.

Commands return {receipt,snapshot}. GET /api/game/operations/:operationId returns committed receipt and current snapshot, or not-found with safeToRetry=true: same-ID transaction uniqueness remains safe even if an older request is still committing. Foreign-owned IDs return 404. GET /api/game/attempts/:attemptId is owner-scoped. Committed receipts include immutable safe resultSnapshot, committed timestamp and resultingRevision; envelope snapshot is current. Rejected requests have no committed effects/receipt.

## Invariants

Globally unique operation IDs and payload hashes reject changed/foreign replays. Identical requests return the original receipt, including after process restart. Attempt IDs are globally unique; a partial unique owner index enforces one active attempt. A different start cannot overwrite it. Start/reward require exact revision; terminal requires the same active attempt/run/baseline and a revision from its start through the current revision. This permits unrelated heart refills without silently accepting an older/new attempt. Transaction write conflicts serialize account effects. No predecessor recovery/backfill exists. Development stage selection requires explicit NODE_ENV=development and ALLOW_STAGE_SKIP=1 and never marks skipped stages complete. Canonical regular campaigns additionally require exact server-recorded sequence; skipped starts cannot create ranking provenance.

Run IDs live on User and attempts, spanning routes. LOSS/ABANDON commit a new run ID; prior attempts/receipts remain queryable. Receipt retention is account lifetime (no TTL); expiring records would reopen operation IDs. Account deletion/archival and storage-volume controls are deferred.

## Preserved rules and unified inventory

Preserve the existing account baseline 120/120/120 at fresh stage 1/reset, 800 first-win / 400 permitted replay points, 1000 EXP per win and 3000 EXP per meta level. Legitimate newly acknowledged attempts can still earn EXP under existing rules; repeating one attempt/command cannot. Guest defaults remain 1/1/2. Stage 12 preserves gameplay score/EXP/inventory rules but is an optional sandbox excluded from campaign results. Hearts are not newly made a stage-access gate.

Inventory starts from the acknowledged baseline. Only terminal commits subtract observed uses; the training scenario in the versioned stage catalog is infinite and records observations without spending. No per-use PATCH or client-supplied balance/grant is accepted. Level-up WIN produces a durable +2 choice entitlement. Claim is a receipt-bearing operation, permitted outside active attempts so inventory baselines cannot change underneath play. Choices can be deferred within that run; LOSS/ABANDON cancels outstanding run choices as part of the existing inventory reset. Claim replay cannot double-grant. WIN badges retain existing conditions and last-used-power observation.

LOSS/ABANDON preserve meta level/EXP, refill according to existing 30-minute rules before spending one heart if available, reset run progress/score/powers, and increment game/loss counters once. An ACTIVE regular campaign is closed as RESET, never published. A previously completed best result is retained. The automatic heart scheduler uses conditional updates plus revision increment to avoid overwriting concurrent gameplay.

Historical mutation controllers/files remain as reference, but old start/complete/lose/abandon and arbitrary powers PATCH routes return 410. Legacy campaign mutation routes return 410 permanently. Canonical campaign finalization is part of the authoritative stage-11 WIN transaction; see CAMPAIGN-CONTRACT.md.

## Limits

Browser outcomes and reported usage are observations, not cryptographically proved engine execution. This enforces ownership, access/sequence, baseline bounds and repeat-safe effects, not cheat-proof gameplay. Transactions and receipt uniqueness, not HTTP deadlines, protect ambiguous retries. Receipt queries precede explicit same-ID retry. No production topology, transaction deployment or gameplay balance was runtime-verified. Campaign rankings intentionally preserve regular-stage points rather than introducing a new economy.
