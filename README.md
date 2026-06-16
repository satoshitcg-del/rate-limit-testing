# Rate Limit Testing Project

## Overview
API Rate Limit Testing สำหรับ askmebill.com Customer API
- **Customer API:** https://api-sit.askmebill.com
- **Framework:** Playwright (API Testing)

## Test Case Coverage

| TC | Test Case | Test File | Status |
|----|-----------|-----------|--------|
| TC-01 | Sign-in Rate Limit (5 req/min) | tc01-auth-signin.spec.ts | ✅ |
| TC-03 | IP Isolation | (covered by other tests) | ⬜ ข้าม |
| TC-04 | Payment Verify (10 req/min) | tc04-payment-verify.spec.ts | ✅ |
| TC-05 | User Isolation | tc05-user-isolation.spec.ts | ✅ |
| TC-06 | Standard Routes (60 req/min) | tc06-standard-routes.spec.ts | ✅ |
| TC-07 | Response Format (code=10027) | tc07-response-format.spec.ts | ✅ |
| TC-08 | ADMIN Exempt | tc08-admin-exempt.spec.ts | ✅ |
| TC-09 | Multi-Pod State (MongoDB) | (ต้องมี 2+ pods) | ⬜ ข้าม |
| TC-10 | ClearRateLimit Correctness (ACC-1427 Redis) | tc10-clear-ratelimit.spec.ts | ✅ |

**สรุป:** ผ่าน 7/9 (= 9 tests, 1 ต่อ invariant) | ข้าม 2/9
TC-02 (window reset) ตัดออก → correctness ของ time-window ควรอยู่ใน backend unit test (fake clock) ดู [docs/rate-limit-test-strategy.md](docs/rate-limit-test-strategy.md)

> ผล run ล่าสุด: **8 passed / 1 skipped / 0 failed** (TC-08 skip — BO `superadmin_eiji` lockout). ทุก tier เจอ 429 จริง.

## Test Cases — Step by Step

9 tests, 1 ต่อ invariant. รันแบบ **serial** (`workers: 1`) เพราะ share IP + per-user counter.

### TC-01-01 — Sign-in strict tier (5 req/min, key = IP)
1. burst `POST /v1/md/auth/customer/sign-in` × 15 (ใช้ **wrong password** — rate limit นับ IP ก่อน auth จึงยังโดน, แต่ไม่ rotate session)
2. หา response แรกที่ `isRateLimited` (429)
- ✅ เจอ 429 ภายใน burst (ปกติ ~ครั้งที่ 6) · ถ้า IP โดน admin-block (10019 → 400 ไม่มี 429) → `test.skip` (ไม่ใช่ pass)

### TC-04-01 — Payment tier (10 req/min, key = userID)
1. `getFreshToken(eiji)` จาก cache (pre-fetch ใน global-setup)
2. burst `POST /v1/md/billing-note/payment/verify` × 15
- ✅ โดน 429 ที่ ~ครั้งที่ 11 (assert `rateLimitedAt ≤ 13`)

### TC-05-01 — User isolation (counter แยกราย userID)
1. cache token 2 user จริง: `eiji` (A) + `eiji2` (B)
2. `clearRateLimitForUser` ทั้งคู่ → burst payment A × 15 → burst payment B × 15
- ✅ ต่างคนต่างโดน 429 ที่ ~#11 (≤12) — counter ของ A กับ B แยกกัน

### TC-06-01 — Standard tier (60 req/min, key = userID)
1. `getFreshToken(eiji2)` → clear
2. burst `GET /v1/md/user/profile` × 80
- ✅ โดน 429 ที่ ~#61

### TC-06-02 — Shared counter ข้าม route (ราย userID)
1. clear eiji2 → burst route A (`/v1/md/user/profile`) จนโดน limit
2. ยิง route B (`/v1/md/customer/sub-accounts`) อีก 3 ครั้ง
- ✅ route B โดน 429 ด้วย → counter แชร์ทุก standard route ของ user เดียวกัน (path-pattern middleware)

### TC-07-02 — 429 response contract
1. burst sign-in × 15 (wrong password) จนโดน 429
2. อ่าน `body.code` ของ response ที่โดน limit
- ✅ `code === 10027`

### TC-08-02 — Admin exempt *(ปัจจุบัน skip)*
1. login BO `superadmin_eiji`
2. burst BO endpoints (`/v1/customer/search`, `/v1/product/list`, ...) × 10 ต่อ endpoint
- ✅ 429 = 0 ทุก endpoint (SUPERADMIN ยกเว้น, ACC-1138) · ⏭ ตอนนี้ skip เพราะ BO login fail (lockout code 10012)

### TC-10-01 — ClearRateLimit ปลด block ได้จริง (ACC-1427)
1. clear eiji baseline → burst payment × 15 → **ต้องโดน 429 ก่อน**
2. `clearRateLimitForUser(eiji)` → burst payment × 3
- ✅ หลัง clear ไม่เจอ 429 อีก (counter reset จริงหลัง migrate Redis)

### TC-10-02 — ClearRateLimit ไม่ over-match (ACC-1427 — เคสสำคัญสุด)
1. clear + block ทั้ง `eiji` (A) และ `eiji2` (B) — ตั้งใจเลือกชื่อที่ A เป็น substring ของ B
2. clear **เฉพาะ A** → เช็ค B (3 req) → เช็ค A (3 req)
- ✅ A หลุด block (`429 = 0`), **B ยังโดน block** — พิสูจน์ SCAN pattern `*{userId}*` ไม่ over-match (clear `eiji` ต้องไม่ลบ key ของ `eiji2`)

## Project Structure

```
├── CLAUDE.md                    # Claude best practices
├── playwright.config.ts          # Playwright configuration
├── package.json                 # npm scripts
├── README.md                    # This file
├── .gitignore                   # Git ignore
├── .env                         # Environment variables (git ignored)
├── .env.example                 # Environment template
├── api/                         # API Client classes
│   └── auth.client.ts           # Authentication endpoints
├── config/
│   └── env.ts                   # Environment settings
├── common/
│   └── utils.ts                 # Logger, wait, waitForRateLimitReset
├── tests/
│   ├── helpers/                 # สิ่งที่ spec เรียก (แยกตามหน้าที่)
│   │   ├── burst.ts             # burstTest, analyzeRateLimitResults, ipBlocked
│   │   ├── auth-helpers.ts      # getFreshToken, clearRateLimitForUser, refreshAccessToken
│   │   └── rate-limit-analyzer.ts # index — re-export 2 ไฟล์บน (import เดิมยังใช้ได้)
│   └── rate-limit/
│       ├── tc01-auth-signin.spec.ts      # TC-01
│       ├── tc04-payment-verify.spec.ts  # TC-04
│       ├── tc05-user-isolation.spec.ts   # TC-05
│       ├── tc06-standard-routes.spec.ts  # TC-06 (consolidated)
│       ├── tc07-response-format.spec.ts  # TC-07
│       ├── tc08-admin-exempt.spec.ts     # TC-08
│       └── tc10-clear-ratelimit.spec.ts  # TC-10 (ACC-1427 Redis)
└── global-setup.ts             # Token cache pre-fetch
```

## How It Works (Flow)

แต่ละ spec = 1 scenario. ขั้นตอน 1 test:

```
global-setup.ts          login ทุก user ล่วงหน้า → cache token (tests/helpers/token-cache.json)
   ↓
tcNN-*.spec.ts           describe/test — เรียก helper
   ↓
burst.ts burstTest()     ยิง endpoint รัวๆ (fetch ผ่าน api/*.client) จนเจอ 429 หรือครบ burstSize
   ↓
analyzeRateLimitResults()  สรุป: โดน limit ไหม / ครั้งที่เท่าไหร่ / code 10027?
   ↓
expect()                 assert
```

**Layer:**
- `tests/rate-limit/*.spec.ts` — scenario + assertions (อ่านไฟล์เดียวจบ 1 เคส)
- `tests/helpers/` — `burst` (ยิง+วิเคราะห์) · `auth-helpers` (token + เคลียร์ state)
- `api/auth.client.ts` — เรียก endpoint จริง (AuthClient)
- `config/env.ts` — base URL + env (SIT)

**เพิ่มเทสใหม่:** สร้าง `tcNN-xxx.spec.ts` → `import { burstTest } from '../helpers/burst'` → เพิ่ม glob ใน `playwright.config.ts` `testMatch`

## Rate Limit Tiers (from ACC-1138)

| Tier | Endpoint | Limit | Key |
|------|----------|-------|-----|
| strict | POST /v1/auth/customer/sign-in | 5 req/min | IP |
| payment | POST /v1/billing-note/payment/verify | 10 req/min | userID+IP |
| standard | CUSTOMER routes อื่นๆ | 60 req/min | userID+IP |

## Setup

```bash
# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Then edit .env with your credentials

# Run all tests
npm test

# Run specific test file
npx playwright test tests/rate-limit/tc01-auth-signin.spec.ts

# Run with HTML report
npx playwright test --reporter=html
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `API_BASE_URL` | Customer API base URL |
| `AUTH_EMAIL` | Test account email (eiji) |
| `AUTH_PASSWORD` | Test account password |
| `AUTH_2FA` | TOTP code |
| `AUTH_EMAIL_C` / `AUTH_PASSWORD_C` | Second real user (eiji2) — used by TC-05/06/10 |
| `BO_API_BASE_URL` | BO/Admin API base URL |
| `BO_EMAIL` | Superadmin email |
| `BO_PASSWORD` | Superadmin password |
| `BO_2FA` | Superadmin 2FA |

## TC-07 Expected Response Format

When rate limited (HTTP 429):
```json
{
  "success": false,
  "code": 10027,
  "message": "too many requests"
}
```

## Token Caching

`global-setup.ts` pre-fetches tokens once before the run → `tests/helpers/token-cache.json`:
- **Expiry read from the real JWT `exp`** — the backend issues it as a *nanosecond string*, real TTL ~15 min. `loadFileCache` validates each token's actual exp and drops expired ones (no more fabricated `now + 1h`, which used to serve dead tokens → 401).
- 65s delay between sign-ins in setup to avoid the IP rate limit.
- **Single-session caveat:** a *successful* login rotates the session and invalidates a user's previously cached token. So specs that only need to trigger the limit (tc01/tc07 sign-in burst) use a **wrong password** — the IP limit still counts the attempt, no session rotated. Specs needing a usable token reuse the cached one.
- Cache file is git-ignored; delete it to force a fresh fetch.

## Rate Limit Behavior (Important)

- Rate limit counter is **SHARED across ALL standard endpoints** for same user
- When rate limited, all endpoints return HTTP 429 with code 10027
- Window resets after 61 seconds
- Use `clearRateLimitForUser()` to reset user-based rate limit
- IP-based rate limit (sign-in) cannot be cleared, must wait 61s

## Related Files

- `swag-customer.json` - Customer API Swagger (76 endpoints)
- `swag-admin.json` - Admin API Swagger (101 endpoints)
