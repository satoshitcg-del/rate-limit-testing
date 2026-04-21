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
├── fixtures/               # Custom Playwright fixtures
│   └── api-fixtures.ts     # Authenticated contexts
├── validators/             # Centralized assertions
│   └── rate-limit.validators.ts
├── tests/
│   ├── rate-limit/         # Rate limit test cases
│   └── helpers/            # Test helpers
├── logs/                   # Execution logs
├── .env                    # Environment variables (git ignored)
├── .env.example            # Template for env variables
├── playwright.config.ts    # Playwright configuration
└── CLAUDE.md               # This file
```

## Rate Limit Tiers

| Tier | Endpoint Pattern | Limit | Key |
|------|------------------|-------|-----|
| strict | /v1/auth/*, /v1/md/auth/* | 5 req/min | IP |
| payment | /v1/md/billing-note/payment/* | 10 req/min | userID |
| standard | CUSTOMER routes อื่นๆ | 60 req/min | userID (fallback IP) |

## Test Coverage

| TC | Test Case | File | Status |
|----|-----------|------|--------|
| TC-01 | Sign-in Rate Limit 5 req/min | tc01-auth-signin.spec.ts | ✅ |
| TC-02 | Window Reset 61 sec | tc02-window-reset.spec.ts | ✅ |
| TC-04 | Payment Verify 10 req/min | tc04-payment-verify.spec.ts | ✅ |
| TC-05 | User Isolation | tc05-user-isolation.spec.ts | ✅ |
| TC-06 | Standard Routes 60 req/min | tc06-standard-routes*.spec.ts | ✅ |
| TC-07 | Response Format (code=10027) | tc07-response-format.spec.ts | ✅ |
| TC-08 | ADMIN Exempt | tc08-admin-exempt.spec.ts | ✅ |

**Note:** TC-03 (IP Isolation) is covered by existing tests.

## Environment Variables

```bash
# API Base URLs
API_BASE_URL=https://api-sit.askmebill.com
BO_API_BASE_URL=https://apixint-sit.askmebill.com

# User Credentials (eiji - main user)
AUTH_EMAIL=eiji
AUTH_PASSWORD=0897421942@Earth
AUTH_2FA=954900

# User B (admintest)
AUTH_EMAIL_B=admintest
AUTH_PASSWORD_B=0897421942@Earth

# Additional Users (C-H for parallel testing)
AUTH_EMAIL_C=eiji2
AUTH_PASSWORD_C=0897421942@Earth
AUTH_EMAIL_D=eiji3
AUTH_PASSWORD_D=0897421942@Earth
AUTH_EMAIL_E=eiji4
AUTH_PASSWORD_E=0897421942@Earth
AUTH_EMAIL_F=eiji5
AUTH_PASSWORD_F=0897421942@Earth
AUTH_EMAIL_G=eiji6
AUTH_PASSWORD_G=0897421942@Earth
AUTH_EMAIL_H=eiji7
AUTH_PASSWORD_H=0897421942@Earth

# BO Admin
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
- Uploads HTML report as artifact (14 days retention)
- Uploads test results as artifact

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

## Known Issues (BUG - Report to Dev Team)

Endpoints WITHOUT rate limit protection (Dev claims fixed but NOT working):
1. POST /v1/md/auth/customer/verify - Should have strict tier
2. POST /v1/md/auth/verify/totp - Should have strict tier
3. GET /v1/md/user/profile - Should have standard tier
4. GET /v1/md/billing-note/customer-export/{id} - Should have standard tier
5. GET /v1/md/billing-note/preview/{id} - Should have standard tier
6. POST /v1/md/system-file/invoice/slip - Should have standard tier

## Rate Limit Reset

`POST /v1/system/clear-ratelimit` on BO API to reset rate limit counter:
```typescript
await authClient.clearRateLimit(username: string, ip?: string)
```

## Best Practices

1. **Use API Clients** - Don't call HTTP directly, use `api/auth.client.ts`
2. **Use Fixtures** - Use `authenticatedFixture` for auth context
3. **Use Validators** - Use centralized validators in `validators/`
4. **Wait for rate limit** - Use `waitForRateLimitReset()` between tests
5. **Centralize test data** - Use `config/env.ts` for environments and users