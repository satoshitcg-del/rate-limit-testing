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
| `AUTH_EMAIL_C-L` | Additional users for TC-06 (eiji2-eiji11) |
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

Tests use token caching via `global-setup.ts`:
- Pre-fetches tokens for all users before tests
- Caches to `tests/helpers/token-cache.json`
- Tokens valid for 1 hour (30 min buffer before refresh)
- Avoids IP rate limit with 65s delay between sign-ins
- CI automatically clears cache before each run to prevent 401 errors

## Rate Limit Behavior (Important)

- Rate limit counter is **SHARED across ALL standard endpoints** for same user
- When rate limited, all endpoints return HTTP 429 with code 10027
- Window resets after 61 seconds
- Use `clearRateLimitForUser()` to reset user-based rate limit
- IP-based rate limit (sign-in) cannot be cleared, must wait 61s

## Related Files

- `swag-customer.json` - Customer API Swagger (76 endpoints)
- `swag-admin.json` - Admin API Swagger (101 endpoints)
