# Rate-Limit Testing Strategy & Recommendation

> Recommendation for the backend team (`ishef-account-api`).
> This repo (`rate-limit-testing`) is the **black-box E2E regression net** for the
> ACC-1427 Mongo→Redis migration — not the place to prove correctness.

## TL;DR

Rate limiting is a **time-window algorithm**. Testing it black-box against live SIT is
inherently **slow** (real 60s windows can't be mocked) and **flaky** (every test on one
machine shares the IP counter; same-user tests share the user counter → must run serially).

Correctness should be proven in **backend unit/integration tests with a fake clock +
in-memory Redis** — instant, exhaustive, deterministic. Keep this E2E suite as a **thin
smoke/regression** layer only.

## Why E2E is the wrong layer for correctness

| Concern | Black-box E2E (this repo) | Backend unit (recommended) |
|---|---|---|
| 60s window reset (cut from E2E) | needed `sleep(61s)` — real time, straddle-flaky | advance fake clock → instant |
| Boundary edges (exactly at limit, window rollover, INCR+EXPIRE race) | hard/slow to hit live | trivial + deterministic |
| Shared-counter contention | one IP / shared users → serial-only, flaky | isolated per test |
| Speed | minutes (this suite ~5–8 min) | milliseconds |
| Run in CI every push | too slow | yes |

## Recommended split

### Backend unit/integration (`ishef-account-api`) — the real correctness suite
Inject a fake clock (`now()`) + in-memory/mini Redis so everything is instant & deterministic:

- **`Allow()` fixed-window**: `count <= max` passes, `count > max` → 429; bucket = `time.Truncate(window)`.
- **TTL** = `window*2`; INCR-then-EXPIRE behaviour; orphan-key worst case (crash between INCR/EXPIRE).
- **`ClearRateLimit()`** SCAN pattern `rl:{env}:*{id}*` — **over-match guard**: clearing `eiji`
  must NOT clear `eiji2`; IP `10.0.0.1` must NOT clear `10.0.0.12`.
- **Fallback / circuit breaker** (`rate_limit_fallback.go`): Redis error → Mongo; probe 30s → recover.
  Drive with a fake failing Redis client.
- **Key selection** per route/tier (strict=IP, payment/standard=user:{id}); exempt roles.

### This E2E repo — thin regression smoke (keep small, run on demand / nightly)
- 1 test per tier: external behaviour end-to-end (429 + body `code: 10027` on SIT).
- `ClearRateLimit` reachable (tc10).
- Admin exempt (tc08).
- **NOT** exhaustive correctness. Do not grow this into a correctness suite.

## Current E2E suite (post-trim)

**9 tests** (1 per invariant), **serial** (`workers: 1`, `fullyParallel: false`) — required
because tests share the machine IP and per-user counters. The 61s window-reset waits were
removed with tc02 (that correctness belongs in backend fake-clock unit tests); the only
remaining real-time cost is IP-login spacing in `global-setup`. Acceptable for an occasional
regression net.

Kept, one each: tier triggers (tc01 strict / tc04 payment / tc06 standard), userID isolation
(tc05), shared-counter-across-routes (tc06-02), body `code:10027` contract (tc07-02), admin
exempt (tc08), ClearRateLimit over-match guard (tc10). Everything redundant or
time-window-correctness was cut.

## Action for backend team

Add the unit/integration tests above against:
`core/ports/rate_limit.go` · `infrastructure/redis|mongo/rate_limit.go` ·
`infrastructure/rate_limit_fallback.go` · `app/api/middlewares/rate_limit.go`.
Once those exist, this E2E suite can shrink further to pure smoke.
