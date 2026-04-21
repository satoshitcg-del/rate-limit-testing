import { readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(__dirname, '..', 'fixtures', 'tokens.json');

const API_BASE = 'https://api-sit.askmebill.com';

const users = [
  { name: 'eiji', email: 'eiji', password: '0897421942@Earth' },
  { name: 'eiji2', email: 'eiji2', password: '0897421942@Earth' },
  { name: 'eiji3', email: 'eiji3', password: '0897421942@Earth' },
  { name: 'eiji4', email: 'eiji4', password: '0897421942@Earth' },
  { name: 'eiji5', email: 'eiji5', password: '0897421942@Earth' },
  { name: 'eiji6', email: 'eiji6', password: '0897421942@Earth' },
  { name: 'eiji7', email: 'eiji7', password: '0897421942@Earth' },
];

async function signIn(email, password, retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      // Step 1: Sign in
      const signInRes = await fetch(`${API_BASE}/v1/md/auth/customer/sign-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (signInRes.status === 429) {
        console.log(`    ⏳ Rate limited (sign-in), waiting 65s... (${i + 1}/${retries})`);
        await new Promise(r => setTimeout(r, 65000));
        continue;
      }

      const signInData = await signInRes.json();
      const initialToken = signInData.data?.token;

      if (!initialToken) {
        console.log(`    ⚠️ No initial token:`, signInData);
        return null;
      }

      // Step 2: Verify TOTP to get is_accessapi: true
      const totpRes = await fetch(`${API_BASE}/v1/md/auth/verify/totp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${initialToken}`,
        },
        body: JSON.stringify({ totp_key: '954900', generate_token: true }),
      });

      if (totpRes.status === 429) {
        console.log(`    ⏳ Rate limited (TOTP), waiting 65s... (${i + 1}/${retries})`);
        await new Promise(r => setTimeout(r, 65000));
        continue;
      }

      const totpData = await totpRes.json();
      const finalToken = totpData.data?.token;

      return finalToken || initialToken;
    } catch (e) {
      console.log(`    ❌ Error:`, e.message);
    }
  }
  return null;
}

async function main() {
  console.log('🔑 Pre-authenticating users for Rate Limit Tests\n');
  console.log('='.repeat(50));

  const tokens = { version: 1, createdAt: Date.now(), users: {} };

  for (const user of users) {
    process.stdout.write(`\n${user.name} (${user.email}): `);

    const token = await signIn(user.email, user.password);

    if (token) {
      tokens.users[user.name] = {
        email: user.email,
        token,
        refreshToken: '',
        expiresAt: Date.now() + 86400000, // 1 day
        needsTotp: false,
      };
      console.log('✅');
    } else {
      console.log('❌ FAILED');
    }

    // Wait 65s between each user to avoid rate limit
    if (user !== users[users.length - 1]) {
      console.log('  ⏳ Waiting 65s before next user...');
      await new Promise(r => setTimeout(r, 65000));
    }
  }

  await writeFile(CACHE_FILE, JSON.stringify(tokens, null, 2));
  console.log('\n' + '='.repeat(50));
  console.log(`💾 Tokens cached to ${CACHE_FILE}`);
  console.log(`📝 ${Object.keys(tokens.users).length}/${users.length} users authenticated`);
  console.log('\n✅ Run tests with: npx playwright test');
}

main().catch(console.error);
