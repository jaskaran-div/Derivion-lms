// Request signing shared by the server (verification) and any client (the LMS worker, tests).
//
// Headers on every request:
//   X-Integration-Timestamp  unix seconds
//   X-Integration-Nonce      random 16-64 chars [A-Za-z0-9_-], never reused
//   X-Integration-Signature  hex HMAC-SHA256(secret, canonical string)
//
// canonical = "v1\n" + timestamp + "\n" + nonce + "\n" + METHOD + "\n" + path-with-query + "\n" + sha256hex(raw body)
const crypto = require('crypto');

const sha256Hex = (data) => crypto.createHash('sha256').update(data).digest('hex');

function canonicalString({ timestamp, nonce, method, path, body }) {
  return ['v1', timestamp, nonce, String(method).toUpperCase(), path, sha256Hex(body || '')].join('\n');
}

function sign(secret, parts) {
  return crypto.createHmac('sha256', secret).update(canonicalString(parts)).digest('hex');
}

// Returns the headers to send for a request. `body` is the exact string/Buffer put on the wire.
function signedHeaders(secret, { method, path, body = '' }) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(18).toString('base64url');
  return {
    'X-Integration-Timestamp': timestamp,
    'X-Integration-Nonce': nonce,
    'X-Integration-Signature': sign(secret, { timestamp, nonce, method, path, body }),
  };
}

module.exports = { sha256Hex, canonicalString, sign, signedHeaders };
