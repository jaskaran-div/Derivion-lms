const cache = require('../config/cache');

/**
 * Cache a route's successful JSON response for `ttlSeconds`.
 * `keyFn(req)` builds the cache key (include anything the response depends on, e.g. query params).
 */
const cacheResponse = (keyFn, ttlSeconds = 30) => async (req, res, next) => {
  const key = `resp:${keyFn(req)}`;
  try {
    const hit = await cache.get(key);
    if (hit !== undefined) {
      res.set('X-Cache', 'HIT');
      return res.json(hit);
    }
  } catch { /* cache unavailable: just run the handler */ }

  const json = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode < 400 && body?.success !== false) cache.set(key, body, ttlSeconds).catch(() => {});
    res.set('X-Cache', 'MISS');
    return json(body);
  };
  next();
};

module.exports = { cacheResponse };
