# Rate Limit Testing Project

## Overview
API Rate Limit Testing สำหรับ askmebill.com Customer API
- **Customer API:** https://api-sit.askmebill.com
Framework: Playwright (API Testing)

## Test Case Coverage

| TC | Test Case | Test File | Status |
|----|-----------|-----------|--------|
| TC-01 | Sign-in Rate Limit (5 req/min) | auth.spec.ts | ✅ |
| TC-02 | Window Reset (61 sec) | window-reset.spec.ts | ✅ |
| TC-03 | IP Isolation | (auto - IP-based) | ✅ |
| TC-04 | Payment Verify (10 req/min) | customer.spec.ts | ✅ |
| TC-05 | User Isolation | user-isolation.spec.ts | ✅ |
| TC-06 | Standard Routes (60 req/min) | customer.spec.ts | ✅ |
| TC-07 | Response Format (code=10027) | response-format.spec.ts, auth.spec.ts | ✅ |
| TC-08 | ADMIN Exempt | admin-exempt.spec.ts | ✅ |
| TC-09 | Multi-Pod State (MongoDB) | (same as TC-01) | ✅ |

## Project Structure

```
├── CLAUDE.md                    # Claude best practices
├── playwright.config.ts          # Playwright configuration
├── package.json                 # npm scripts
├── README.md                    # This file
├── .gitignore                   # Git ignore
├── .env.example                 # Environment template
└── tests/
    ├── helpers/
    │   ├── api-client.ts        # API client wrapper
    │   └── rate-limit-analyzer.ts # Rate limit analysis tools
    └── rate-limit/
        ├── auth.spec.ts         # TC-01, TC-07, Auth tests (logout)
        ├── customer.spec.ts     # TC-04, TC-06 Customer tests
        ├── window-reset.spec.ts # TC-02 Window Reset tests
        ├── response-format.spec.ts # TC-07 Response Format tests
        ├── user-isolation.spec.ts # TC-05 User Isolation tests
        ├── admin-exempt.spec.ts # TC-08 ADMIN Exempt tests
        └── system.spec.ts       # TC-06 System endpoints tests
```

## Rate Limit Tiers (from ACC-1138)

| Tier | Endpoint | Limit | Key |
|------|----------|-------|-----|
| strict | POST /v1/auth/customer/sign-in | 5 req/min | IP |
| payment | POST /v1/billing-note/payment/verify | 10 req/min | userID |
| standard | CUSTOMER routes อื่นๆ | 60 req/min | userID (fallback IP) |

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
npx playwright test tests/rate-limit/auth.spec.ts
npx playwright test tests/rate-limit/window-reset.spec.ts
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `API_BASE_URL` | Customer API base URL | https://api-sit.askmebill.com |
| `AUTH_EMAIL` | Test account A email | admin_eiji |
| `AUTH_PASSWORD` | Test account A password | 0897421942@Earth |
| `AUTH_EMAIL_B` | Test account B email (TC-05) | admintest |
| `AUTH_PASSWORD_B` | Test account B password | 0897421942@Earth |
| `BO_API_BASE_URL` | BO/Admin API base URL | https://apixint-sit.askmebill.com |
| `BO_EMAIL` | Superadmin email (TC-08) | superadmin_eiji |
| `BO_PASSWORD` | Superadmin password | 0897421942@Earth |
| `BO_2FA` | Superadmin 2FA | 954900 |

## TC-07 Expected Response Format

When rate limited (HTTP 429):
```json
{
  "success": false,
  "code": 10027,
  "message": "too many requests"
}
```

## Pending (need credentials)

- **TC-05 User Isolation:** ต้องมี 2 user accounts
- **TC-08 ADMIN Exempt:** ต้องมี ADMIN/SUPERADMIN account

## Related Files

- `D:\Users\nuttawat.jun\Downloads\swag-customer.json` - Customer API Swagger (76 endpoints)
- `D:\Users\nuttawat.jun\Downloads\swag-admin.json` - Admin API Swagger (101 endpoints)
- `D:\Users\nuttawat.jun\Documents\eiji\API-Calls-2026-04-16.md` - Captured API calls
