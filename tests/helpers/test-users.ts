/**
 * Shared test users for TC-06 (standard-tier 60/min routes).
 * Creds come from env (AUTH_EMAIL_C.. / AUTH_PASSWORD_C..); fallback usernames are local SIT accounts.
 * `endpoints[]` = the routes each user hits during the burst.
 */
export const TC06_USERS = [
  {
    name: 'User C',
    email: process.env.AUTH_EMAIL_C || 'eiji2',
    password: process.env.AUTH_PASSWORD_C || '',
    totp: process.env.AUTH_2FA || '',
    endpoints: [
      '/v1/md/user/profile',
      '/v1/md/customer/sub-accounts?page=1&limit=25',
      '/v1/md/billing-note/customer-export-all/PENDING',
    ],
  },
  {
    name: 'User D',
    email: process.env.AUTH_EMAIL_D || 'eiji3',
    password: process.env.AUTH_PASSWORD_D || '',
    totp: process.env.AUTH_2FA || '',
    endpoints: [
      '/v1/md/billing-note/customer-export-all/ALL',
      '/v1/md/billing-note/customer-export-all/UNPAID',
      '/v1/md/billing-note/customer?status=UNPAID',
    ],
  },
  {
    name: 'User E',
    email: process.env.AUTH_EMAIL_E || 'eiji8',
    password: process.env.AUTH_PASSWORD_E || '',
    totp: process.env.AUTH_2FA || '',
    endpoints: [
      '/v2/md/billing-note/customer?status=PARTIALPAID,DELIVERED,VERIFYPAYMENT&page=1&limit=25',
      '/v2/md/billing-note/customer?status=PAID&page=1&limit=25',
      '/v2/md/billing-note/customer?status=EXCEED&page=1&limit=25',
    ],
  },
  {
    name: 'User F',
    email: process.env.AUTH_EMAIL_F || 'eiji9',
    password: process.env.AUTH_PASSWORD_F || '',
    totp: process.env.AUTH_2FA || '',
    endpoints: [
      '/v1/md/billing-note/customer?status=PAID',
      '/v1/md/billing-note/customer?status=PARTIALPAID,DELIVERED,VERIFYPAYMENT',
      '/v1/md/billing-note/customer?status=EXCEED',
    ],
  },
  {
    name: 'User G',
    email: process.env.AUTH_EMAIL_G || 'eiji10',
    password: process.env.AUTH_PASSWORD_G || '',
    totp: process.env.AUTH_2FA || '',
    endpoints: [
      '/v2/md/billing-note/customer?status=REFUND&page=1&limit=25',
      '/v2/md/billing-note/customer?status=VOID&page=1&limit=25',
      '/v1/md/billing-note/customer?status=REFUND',
    ],
  },
  {
    name: 'User H',
    email: process.env.AUTH_EMAIL_H || 'eiji11',
    password: process.env.AUTH_PASSWORD_H || '',
    totp: process.env.AUTH_2FA || '',
    endpoints: [
      '/v1/md/billing-note/customer?status=EXCEED',
      '/v1/md/billing-note/customer?status=VOID',
      '/v2/md/billing-note/customer?status=&page=1&limit=25',
    ],
  },
  {
    name: 'User I',
    email: process.env.AUTH_EMAIL_I || 'eiji12',
    password: process.env.AUTH_PASSWORD_I || '',
    totp: process.env.AUTH_2FA || '',
    endpoints: [
      '/v1/md/billing-note/customer-export-all/CANCELLED',
      '/v1/md/billing-note/customer-export-all/EXCEED',
      '/v1/md/billing-note/customer-export-all/PARTIALPAID',
    ],
  },
  {
    name: 'User J',
    email: process.env.AUTH_EMAIL_J || 'eiji9',
    password: process.env.AUTH_PASSWORD_J || '',
    totp: process.env.AUTH_2FA || '',
    endpoints: [
      '/v2/md/billing-note/customer?status=PARTIALPAID&page=1&limit=25',
      '/v2/md/billing-note/customer?status=DELIVERED&page=1&limit=25',
      '/v2/md/billing-note/customer?status=VERIFYPAYMENT&page=1&limit=25',
    ],
  },
  {
    name: 'User K',
    email: process.env.AUTH_EMAIL_K || 'eiji10',
    password: process.env.AUTH_PASSWORD_K || '',
    totp: process.env.AUTH_2FA || '',
    endpoints: [
      '/v1/md/customer/sub-accounts?page=2&limit=25',
      '/v1/md/customer/sub-accounts?page=3&limit=25',
      '/v1/md/customer/sub-accounts?page=1&limit=50',
    ],
  },
  {
    name: 'User L',
    email: process.env.AUTH_EMAIL_L || 'eiji11',
    password: process.env.AUTH_PASSWORD_L || '',
    totp: process.env.AUTH_2FA || '',
    endpoints: [
      '/v1/md/user/profile',
      '/v1/md/billing-note/customer?status=PAID&page=1&limit=10',
      '/v1/md/billing-note/customer?status=PAID&page=2&limit=10',
    ],
  },
];
