/**
 * Onboarding link tokens.
 *
 * token = HMAC-SHA256(ONBOARDING_TOKEN_SECRET, "<enrollmentId>:<nonce>")   (64 hex chars)
 *
 * Only SHA-256(token) is stored (here and in Operations). Because the token is derived from a stored nonce and a server
 * secret, a retried email regenerates the *same* link without the raw token ever being written to the database, and a
 * database leak alone does not reveal any usable link.
 */
const crypto = require('crypto');
const { config } = require('../config/integration');

const hash = (token) => crypto.createHash('sha256').update(token, 'utf8').digest('hex');
const derive = (enrollmentId, nonce) =>
  crypto.createHmac('sha256', config().tokenSecret).update(`${enrollmentId}:${nonce}`).digest('hex');

/** Issue a token for an enrollment; earlier unused tokens are revoked. `db` may be a transaction client. */
const issue = async (db, enrollmentId) => {
  const nonce = crypto.randomBytes(16).toString('hex');
  const token = derive(enrollmentId, nonce);
  await db.onboardingToken.updateMany({
    where: { enrollmentId, usedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  const row = await db.onboardingToken.create({
    data: {
      enrollmentId,
      nonce,
      tokenHash: hash(token),
      expiresAt: new Date(Date.now() + config().tokenTtlDays * 24 * 60 * 60 * 1000),
    },
  });
  return { row, token };
};

const tokenFor = (row) => derive(row.enrollmentId, row.nonce);
const linkFor = (row) => `${config().publicUrl}/onboarding/${tokenFor(row)}`;

module.exports = { issue, tokenFor, linkFor, hash };
