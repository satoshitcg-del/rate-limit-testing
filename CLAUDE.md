# CLAUDE.md - API Testing Framework

## Project Overview
- **Purpose:** API Automation Testing Framework for askmebill.com
- **Framework:** Playwright Test
- **API Base URL:** https://api-sit.askmebill.com
- **Test Cases Source:** ClickUp ACC-1157

## Project Structure

```
project/
├── api/                    # API Client classes
│   ├── auth.client.ts      # Authentication endpoints
│   └── billing-note.client.ts # Billing note endpoints
├── common/                 # Shared utilities
│   └── utils.ts            # Logger, wait, helpers
├── config/                 # Configuration
│   └── env.ts              # Environment settings
├── validators/             # Centralized assertions
│   └── rate-limit.validators.ts
├── tests/
│   ├── rate-limit/         # Rate limit test cases
│   │   ├── tc01-auth-signin.spec.ts
│   │   ├── tc02-window-reset.spec.ts
│   │   ├── tc04-payment-verify.spec.ts
│   │   ├── tc05-user-isolation.spec.ts
│   │   ├── tc06-standard-routes.spec.ts  # Consolidated (was 6 files)
│   │   ├── tc07-response-format.spec.ts
│   │   └── tc08-admin-exempt.spec.ts
│   └── helpers/
│       └── rate-limit-analyzer.ts       # Token cache & burst testing
├── global-setup.ts         # Token cache pre-fetch (65s delay between users)
├── .env                    # Environment variables (git ignored)
├── .env.example            # Template for env variables
├── playwright.config.ts    # Playwright configuration
└── CLAUDE.md               # This file
```

## Rate Limit Tiers

| Tier | Endpoint Pattern | Limit | Key |
|------|------------------|-------|-----|
| strict | /v1/auth/*, /v1/md/auth/* | 5 req/min | IP (cannot clear, must wait 61s) |
| payment | /v1/md/billing-note/payment/* | 10 req/min | userID (can clear) |
| standard | CUSTOMER routes อื่นๆ | 60 req/min | userID (can clear) |

## Test Coverage

| TC | Test Case | File | Status |
|----|-----------|------|--------|
| TC-01 | Sign-in Rate Limit 5 req/min | tc01-auth-signin.spec.ts | ✅ |
| TC-02 | Window Reset 61 sec | tc02-window-reset.spec.ts | ✅ |
| TC-03 | IP Isolation | (covered by other tests) | ⬜ ข้าม |
| TC-04 | Payment Verify 10 req/min | tc04-payment-verify.spec.ts | ✅ |
| TC-05 | User Isolation | tc05-user-isolation.spec.ts | ✅ |
| TC-06 | Standard Routes 60 req/min | tc06-standard-routes.spec.ts | ✅ |
| TC-07 | Response Format (code=10027) | tc07-response-format.spec.ts | ✅ |
| TC-08 | ADMIN Exempt | tc08-admin-exempt.spec.ts | ✅ |
| TC-09 | Multi-Pod State | (ต้องมี 2+ pods) | ⬜ ข้าม |

**สรุป:** ผ่าน 7/9 | ข้าม 2/9

## Environment Variables

```bash
# API Base URLs
API_BASE_URL=https://api-sit.askmebill.com
BO_API_BASE_URL=https://apixint-sit.askmebill.com

# User A (eiji - main user for TC-01, TC-02, TC-05)
AUTH_EMAIL=eiji
AUTH_PASSWORD=0897421942@Earth
AUTH_2FA=954900

# User B (admintest - for TC-05, may have wrong credentials)
AUTH_EMAIL_B=admintest
AUTH_PASSWORD_B=0897421942@Earth

# Additional Users C-L (for TC-06 parallel testing)
AUTH_EMAIL_C=eiji2    AUTH_PASSWORD_C=0897421942@Earth
AUTH_EMAIL_D=eiji3    AUTH_PASSWORD_D=0897421942@Earth
AUTH_EMAIL_E=eiji4    AUTH_PASSWORD_E=0897421942@Earth
AUTH_EMAIL_F=eiji5    AUTH_PASSWORD_F=0897421942@Earth
AUTH_EMAIL_G=eiji6    AUTH_PASSWORD_G=0897421942@Earth
AUTH_EMAIL_H=eiji7    AUTH_PASSWORD_H=0897421942@Earth
AUTH_EMAIL_I=eiji8    AUTH_PASSWORD_I=0897421942@Earth
AUTH_EMAIL_J=eiji9    AUTH_PASSWORD_J=0897421942@Earth
AUTH_EMAIL_K=eiji10   AUTH_PASSWORD_K=0897421942@Earth
AUTH_EMAIL_L=eiji11   AUTH_PASSWORD_L=0897421942@Earth

# BO Admin (for TC-08)
BO_EMAIL=superadmin_eiji
BO_PASSWORD=0897421942@Earth
BO_2FA=954900
```

## Running Tests

```bash
# Run all tests
npx playwright test

# Run with HTML report
npx playwright test --reporter=html

# Run specific test file
npx playwright test tests/rate-limit/tc01-auth-signin.spec.ts

# Run specific test
npx playwright test -g "TC-01-01"
```

## CI/CD

GitHub Actions workflow at `.github/workflows/playwright.yml`
- Runs on push to main
- Clears token cache before each run to ensure fresh tokens (prevents 401 errors)
- Uploads HTML report as artifact (14 days retention)
- Uploads test results as artifact
- Secrets required: AUTH_EMAIL, AUTH_PASSWORD, AUTH_2FA, AUTH_EMAIL_C-L, AUTH_PASSWORD_C-L, API_BASE_URL, BO_API_BASE_URL

## TOTP Required

Standard tier endpoints require token with `is_accessapi: true`.
- Login returns token with `is_accessapi: false`
- Must call `/v1/md/auth/verify/totp` to get `is_accessapi: true`
- Test helpers handle this automatically via TOTP step

## TC-07 Response Format

When rate limited (HTTP 429):
```json
{
  "success": false,
  "code": 10027,
  "message": "too many requests"
}
```

## Rate Limit Behavior (Important)

- Rate limit counter is **SHARED across ALL standard endpoints** for same user
- When rate limited, all endpoints return HTTP 429 with code 10027
- Window resets after 61 seconds

## Rate Limit Reset

`POST /v1/system/clear-ratelimit` on BO API to reset rate limit counter:
```typescript
await authClient.clearRateLimit(username: string, ip?: string)
await authClient.clearRateLimit(email); // Clear user-based limit
await authClient.clearRateLimit();      // Clear IP-based limit (strict tier)
```

**Note:** IP-based rate limit (strict tier - sign-in) CANNOT be cleared, must wait 61s

## Token Caching

`global-setup.ts` pre-fetches tokens before tests:
- Uses `getFreshToken()` from rate-limit-analyzer.ts
- 65s delay between users to avoid IP rate limit (5 req/min)
- File cache at `tests/helpers/token-cache.json` (1 hour expiry, 30 min buffer before refresh)
- CI automatically clears cache before each run to prevent 401 errors

## Best Practices

1. **Use API Clients** - Don't call HTTP directly, use `api/auth.client.ts`
2. **Use Validators** - Use centralized validators in `validators/`
3. **Wait for rate limit** - Use `waitForRateLimitReset()` between tests
4. **Centralize test data** - Use `config/env.ts` for environments and users
5. **Clear before burst** - Call `clearRateLimitForUser()` before burst tests
