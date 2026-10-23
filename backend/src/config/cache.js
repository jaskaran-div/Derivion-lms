/**
 * Cache layer: Redis when REDIS_URL is set and reachable, otherwise an in-process memory cache.
 * Values are JSON. Keys are namespaced with "lms:".
 *
 *   await cache.wrap('courses:list:...', 60, () => expensiveQuery())
 *   await cache.delPrefix('courses:')   // invalidate after writes
 */
const Redis = require('ioredis');

const PREFIX = 'lms:';
let redis = null;
let redisReady = false;

if (process.env.REDIS_URL && process.env.NODE_ENV !== 'test') {
  redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: false,
    retryStrategy: (times) => Math.min(times * 500, 10000),
  });
  redis.on('ready', () => {
    redisReady = true;
    console.log('[Cache] Connected to Redis');
  });
  redis.on('end', () => { redisReady = false; });
  redis.on('error', (err) => {
    if (redisReady) console.warn(`[Cache] Redis error: ${err.message}. Falling back to memory cache.`);
    redisReady = false;
  });
}

// ---- in-memory fallback (bounded) ----
const MAX_MEMORY_KEYS = 2000;
const memory = new Map(); // key -> { value, expires }

const memGet = (key) => {
  const hit = memory.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    memory.delete(key);
    return undefined;
  }
  return hit.value;
};

const memSet = (key, value, ttlSeconds) => {
  if (memory.size >= MAX_MEMORY_KEYS) memory.delete(memory.keys().next().value);
  memory.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
};

const get = async (key) => {
  const k = PREFIX + key;
  if (redisReady) {
    try {
      const raw = await redis.get(k);
      return raw == null ? undefined : JSON.parse(raw);
    } catch {
      /* fall through to memory */
    }
  }
  return memGet(k);
};

const set = async (key, value, ttlSeconds = 60) => {
  const k = PREFIX + key;
  if (redisReady) {
    try {
      await redis.set(k, JSON.stringify(value), 'EX', ttlSeconds);
      return;
    } catch {
      /* fall through */
    }
  }
  memSet(k, value, ttlSeconds);
};

const del = async (key) => {
  const k = PREFIX + key;
  memory.delete(k);
  if (redisReady) await redis.del(k).catch(() => {});
};

// Delete every key starting with the given prefix (e.g. "courses:")
const delPrefix = async (prefix) => {
  const p = PREFIX + prefix;
  for (const k of memory.keys()) if (k.startsWith(p)) memory.delete(k);
  if (!redisReady) return;
  try {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', `${p}*`, 'COUNT', 200);
      cursor = next;
      if (keys.length) await redis.del(...keys);
    } while (cursor !== '0');
  } catch {
    /* ignore */
  }
};

// Return the cached value, or compute it, cache it and return it
const wrap = async (key, ttlSeconds, compute) => {
  const cached = await get(key);
  if (cached !== undefined) return cached;
  const value = await compute();
  if (value !== undefined) await set(key, value, ttlSeconds);
  return value;
};

const isRedisReady = () => redisReady;

module.exports = { get, set, del, delPrefix, wrap, isRedisReady, redisClient: () => (redisReady ? redis : null), rawRedis: redis };
