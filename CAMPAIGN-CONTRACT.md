# Canonical account campaign and leaderboard

## Discovery and historical boundaries

The original CampaignRun/CampaignAttempt models and campaign.controller.ts accepted separate client campaign identity and telemetry; campaignRanking.ts ranked inventory-derived tier, levels, move ratios and completion time, while its display score was another metric. AllTimeLeaderboard.model.ts was another retained concept. Leaderboard.model.ts and leaderboard.service.ts represented mutable current-game totalScore; the old page guessed personal rank from top ten and username. None of these sources is canonical now. Their historical source files remain for reference, with no mounted conflicting writer or exported ranking adapter.

The gameplay/profile totalScore is current-run gameplay points, not global rank. Accepted regular WINs retain 800 first-completion points, 400 where replay is permitted, and existing EXP/inventory rules. The normal regular frontier cannot be replayed inside a completed campaign. Stage 12 may still earn its existing gameplay score/EXP; this never affects regular campaign results.

## Run identity and state

AccountCampaignRun uses the existing User.gameplayRunId UUID and verified owner, never a parallel telemetry UUID. A first accepted stage-1 start creates ACTIVE with rules/catalog/score versions, server timestamps/revisions, and regular attempt summaries. Sequential accepted WINs append exactly one stage summary. Reads, refresh, remount and navigation never create runs. A partial unique owner index prevents two ACTIVE runs.

WIN of stage 11 closes ACTIVE as COMPLETED and records immutable result: run ID, score, server finalizedAt, finalized revision, rules/catalog/score version and eleven regular stages. Only accepted terminal commands can finalize. Duplicate commands return the same receipt; new conflicting commands cannot re-finalize.

Regular LOSS or ABANDON closes ACTIVE as RESET, records the reason, then applies existing account loss/reset behavior and new User run UUID. An explicit receipt-bearing NEW_RUN action closes an unfinished run, rotates UUID and resets progress/score/inventory without spending hearts or changing meta/EXP/game statistics. It requires no active or interrupted attempt. A completed run remains closed and immutable through either reset. The next acknowledged stage 1 opens the next ACTIVE run. Navigation to an earlier stage is never a new-run action.

Stage 12 requires a COMPLETED run bound to current User.runId; it is optional sandbox. WIN/LOSS/ABANDON uses Slice 5 attempt integrity and existing gameplay economics. No sandbox outcome changes the closed campaign or best entry. Sandbox LOSS/ABANDON still follows existing account reset semantics; the finalized result survives. No live board is restored.

User.campaign is a transactionally written snapshot projection of the current/last closed run, not an independent command target. Current-user/game snapshot includes campaign, sandboxUnlocked (COMPLETED/current identity), and campaignNeedsReset. A last completed projection may remain visible after reset, with a different new current run ID, until the next regular start.

## Metric, best entry and deterministic rank

Score version regular-campaign-points-v1 sums accepted regular-stage points only. A normal sequential stages 1–11 run scores 8,800. No move-count/time/inventory skill formula is invented: prior telemetry ratios have no trusted equivalent in current terminal commands, and duration includes navigation/pauses. This simple policy frequently ties; it is completion ranking, not a claim of nuanced gameplay skill ranking.

CampaignBestEntry is the sole public leaderboard projection, unique per owner. It points to an immutable completed AccountCampaignRun result. Replace only for higher score, or equal score with earlier finalizedAt; equal/worse later results retain the earlier best. Username/avatar are safe display metadata captured on best-result replacement. Account profile edits do not retroactively rewrite result metadata.

Global ordering: score descending, finalizedAt ascending, owner ObjectId ascending. No email and no untrusted duration. Top ten ranks are deterministic ordinal positions, including ties. Own rank counts all better entries using the identical comparison, in a snapshot read transaction; it never infers global rank from top ten.

## API and privacy

GET /api/leaderboard/top is public, bounded to 10. Envelope: {entries,scoreVersion}. Each row contains only accountId (stable public ID), username, avatar, score, rank, finalizedAt, scoreVersion. No email/profile/session/receipt data. GET /api/leaderboard/me requires bearer identity and returns {rank,best,scoreVersion}; absent results return null/null. Query/body owner hints cannot alter req.auth identity.

/top10 and verified /rank are read aliases to canonical APIs; /rank/:id verifies exact authenticated ownership first. GET /api/campaign/current is an owner-bound alias of the same canonical gameplay/current-user DTO. POST /api/campaign/start, /levelEnd and /levelAbort return authenticated 410. Other historical game mutations remain 410. No mounted campaign telemetry writer or independent leaderboard finalizer exists.

## Consistency and recovery

The existing replica-set snapshot transaction commits User/revision, StageAttempt, AccountCampaignRun, best projection and OperationReceipt together for stage-11 WIN, with majority write concern. A failure rolls all effects back; same-ID retry remains safe. Best replacement occurs inside that same transaction. Standalone MongoDB fails closed for required transactions. Queries/receipts recover immutable finalized result plus current account snapshot after lost response or reload. Receipt journal format remains Slice 5; NEW_RUN joins the existing bounded owner-scoped journal, not an offline queue.

## Legacy data and limits

Separate new collection names prevent historical CampaignRun/LeaderboardEntry/AllTime documents from entering canonical rankings. No migration runs automatically, and no live data was accessed. Historical partial/completed progress without canonical provenance needs explicit New account campaign; it is never silently promoted to a ranking result. An old active attempt must first be explicitly abandoned. A future offline backfill could validate complete Slice 5 attempt/receipt chains and versioned rules before generating results; client telemetry alone is insufficient. Retain historical data and require explicit reviewed migration invocation.

Browser-reported outcomes remain observations, not cheat-proof server simulation. Campaign history records are retained for integrity, without a history UI or retention cleanup. No deployment topology or production data was verified.
