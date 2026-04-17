# CLAUDE.md - Rate Limit Testing Project

## Project Overview
- **Purpose:** API Rate Limit testing สำหรับ askmebill.com Customer API
- **Framework:** Playwright (API Testing with `request.newRequest()`)
- **API Base URL:** https://api-sit.askmebill.com
- **Test Cases Source:** ClickUp ACC-1157

## Rate Limit Tiers

| Tier | Endpoint | Limit | Key |
|------|----------|-------|-----|
| strict | POST /v1/auth/customer/sign-in | 5 req/min | IP |
| payment | POST /v1/billing-note/payment/verify | 10 req/min | userID |
| standard | CUSTOMER routes อื่นๆ | 60 req/min | userID (fallback IP) |

## Test Coverage

| TC | Test Case | File | Status |
|----|-----------|------|--------|
| TC-01 | Sign-in Rate Limit 5 req/min | tc01-auth-signin.spec.ts | ✅ |
| TC-02 | Window Reset 61 sec | tc02-window-reset.spec.ts | ✅ |
| TC-04 | Payment Verify 10 req/min | tc04-payment-verify.spec.ts | ✅ |
| TC-05 | User Isolation | tc05-user-isolation.spec.ts | ✅ |
| TC-06 | Standard Routes 60 req/min | tc06-standard-routes.spec.ts | ✅ |
| TC-07 | Response Format (code=10027) | tc07-response-format.spec.ts | ✅ |
| TC-08 | ADMIN Exempt (BO SUPERADMIN) | tc08-admin-exempt.spec.ts | ✅ |

**Note:** TC-03 (IP Isolation) and TC-09 (Multi-Pod) are covered by existing tests.

## Project Structure
```
project/
├── CLAUDE.md                          # This file
├── docs/
│   ├── api/
│   │   └── rate-limit.postman_collection.json   # Postman collection
│   └── requirements/
│       └── ACC-1138-rate-limit.md     # Task requirements
├── tests/
│   ├── rate-limit/
│   │   ├── tc01-auth-signin.spec.ts   # TC-01 Sign-in Rate Limit
│   │   ├── tc02-window-reset.spec.ts   # TC-02 Window Reset
│   │   ├── tc04-payment-verify.spec.ts # TC-04 Payment Verify
│   │   ├── tc05-user-isolation.spec.ts # TC-05 User Isolation
│   │   ├── tc06-standard-routes.spec.ts # TC-06 Standard Routes
│   │   ├── tc07-response-format.spec.ts # TC-07 Response Format
│   │   └── tc08-admin-exempt.spec.ts   # TC-08 ADMIN Exempt
│   └── helpers/
│       └── rate-limit-analyzer.ts      # Shared helpers
└── playwright.config.ts
```

## Environment Variables
```
API_BASE_URL=https://api-sit.askmebill.com
AUTH_EMAIL=eiji
AUTH_PASSWORD=0897421942@Earth
AUTH_2FA=954900                      # TOTP for is_accessapi=true
AUTH_EMAIL_B=admintest
AUTH_PASSWORD_B=0897421942@Earth
BO_API_BASE_URL=https://apixint-sit.askmebill.com
BO_EMAIL=superadmin_eiji
BO_PASSWORD=0897421942@Earth
BO_2FA=954900
```

## Environment Setup
```
.env.example    # Template - commit to git ✅
.env.sit        # SIT credentials - DO NOT commit ❌
.env            # Local override (git ignored)
```

**To use:** `cp .env.sit .env` before running tests

## Important: TOTP Required
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
- TOTP verify step required to get `is_accessapi: true` token
