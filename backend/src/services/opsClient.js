/**
 * Signed HTTP client for the Operations integration API (see docs in the Operations repo: LMS-INTEGRATION.md).
 */
const axios = require('axios');
const { config } = require('../config/integration');
const { signedHeaders } = require('../utils/integrationSigner');

/**
 * Deliver one outbox event.
 * @returns {Promise<{ok: boolean, permanent?: boolean, error?: string, status?: number, result?: string}>}
 *  - ok: Operations accepted it (processed, ignored, or recognised as a duplicate)
 *  - permanent: retrying cannot help (validation error); the event should be dead-lettered
 */
const deliver = async (event) => {
  const c = config();
  const path = '/api/integrations/lms/events';
  const body = JSON.stringify({
    event_id: event.eventId,
    type: event.type,
    occurred_at: event.createdAt instanceof Date ? event.createdAt.toISOString() : event.createdAt,
    data: event.payload,
  });

  let res;
  try {
    res = await axios.post(`${c.apiUrl}${path}`, body, {
      headers: { 'Content-Type': 'application/json', ...signedHeaders(c.secret, { method: 'POST', path, body }) },
      timeout: 15000,
      validateStatus: () => true,
      transformRequest: [(d) => d],   // send the exact bytes that were signed
    });
  } catch (err) {
    return { ok: false, error: `network: ${err.code || err.message}` };
  }

  if (res.status >= 200 && res.status < 300) return { ok: true, status: res.status, result: res.data?.status };
  const apiError = res.data?.error;
  const message = `${res.status} ${apiError?.code || ''} ${apiError?.message || ''}`.trim();
  // 400/422 = the payload itself is wrong, retrying cannot fix it. Everything else may succeed later:
  // 401 (fix the secret/clock), 404/409 (an earlier event has not arrived yet), 429, 5xx.
  return { ok: false, status: res.status, error: message, permanent: res.status === 400 || res.status === 422 };
};

module.exports = { deliver };
