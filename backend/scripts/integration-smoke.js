/**
 * Smoke test for the signed LMS <-> Operations connection. Safe by default: it only sends a signed ping.
 *
 *   node scripts/integration-smoke.js ping                 signed GET /ping  (no data is created)  [default]
 *   node scripts/integration-smoke.js bad-signature        proves Operations REJECTS a wrong secret (expects 401)
 *   node scripts/integration-smoke.js learner              creates ONE clearly labelled test learner in Operations
 *
 * Reads OPERATIONS_API_URL and LMS_INTEGRATION_SECRET from the environment (or from backend/.env when run on the LMS
 * server). It never prints the secret. It does not touch the LMS database.
 */
require('dotenv').config();
const { signedHeaders } = require('../src/utils/integrationSigner');

const mode = process.argv[2] || 'ping';
const base = (process.env.OPERATIONS_API_URL || '').replace(/\/+$/, '');
const secret = process.env.LMS_INTEGRATION_SECRET || '';
const P = '/api/integrations/lms';

if (!base || secret.length < 32) {
  console.error('Set OPERATIONS_API_URL and LMS_INTEGRATION_SECRET (32+ characters) first.');
  process.exit(1);
}

async function call(method, path, body, useSecret = secret) {
  const raw = body === undefined ? '' : JSON.stringify(body);
  const res = await fetch(`${base}${P}${path}`, {
    method,
    headers: { ...(raw ? { 'Content-Type': 'application/json' } : {}), ...signedHeaders(useSecret, { method, path: P + path, body: raw }) },
    body: raw || undefined,
    signal: AbortSignal.timeout(10000),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

(async () => {
  console.log(`Target: ${base}`);
  if (mode === 'ping') {
    const r = await call('GET', '/ping');
    console.log(`ping -> HTTP ${r.status}`, r.body);
    if (r.status === 200) console.log('OK: Operations accepted the signature. Clock, secret and URL are all correct.');
    else if (r.status === 401) console.log('REJECTED: wrong secret, or the two servers\' clocks differ by more than 5 minutes (run `timedatectl`).');
    else if (r.status === 503) console.log('Operations has no LMS_INTEGRATION_SECRET configured.');
    process.exit(r.status === 200 ? 0 : 1);
  }
  if (mode === 'bad-signature') {
    const r = await call('GET', '/ping', undefined, 'x'.repeat(48));
    console.log(`ping with a WRONG secret -> HTTP ${r.status}`);
    console.log(r.status === 401 ? 'OK: a forged request is rejected.' : 'UNEXPECTED: a forged request was not rejected!');
    process.exit(r.status === 401 ? 0 : 1);
  }
  if (mode === 'learner') {
    const stamp = Date.now().toString(36);
    const r = await call('POST', '/learners', {
      lms_user_id: `smoke-test-${stamp}`, first_name: 'Integration', last_name: 'Smoke Test (safe to ignore)',
      email: `smoke-${stamp}@integration-test.invalid`, email_verified: true, registration_source: 'smoke_test',
    });
    console.log(`create test learner -> HTTP ${r.status}`, r.body);
    console.log(r.status === 201 || r.status === 200 ? 'OK: it should now appear on the Operations Learners page (source "smoke_test").' : 'FAILED');
    process.exit(r.status === 201 || r.status === 200 ? 0 : 1);
  }
  console.error(`Unknown mode "${mode}". Use ping, bad-signature or learner.`);
  process.exit(1);
})().catch((err) => { console.error('Could not reach Operations:', err.cause?.code || err.message); process.exit(1); });
