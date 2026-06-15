/**
 * Rate-limit test helpers — index / barrel.
 *
 * The implementation was split into focused modules (each <250 lines, one job):
 *   ./burst         burstTest, analyzeRateLimitResults, ipBlocked, RateLimitResult, BurstTestConfig
 *   ./auth-helpers  getFreshToken, refreshAccessToken, clearRateLimitForUser, clearIpRateLimit
 *   ./test-users    TC06_USERS
 *
 * Existing imports from this path keep working. In NEW code prefer importing
 * directly from the focused module (e.g. `from '../helpers/burst'`).
 */
export * from './burst';
export * from './auth-helpers';
export * from './test-users';

// Re-export waitForRateLimitReset from common utils
export { waitForRateLimitReset } from '../../common/utils';
