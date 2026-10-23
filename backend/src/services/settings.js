/**
 * Platform settings, stored as one JSON row per group in `site_settings` and cached.
 */
const prisma = require('../config/database');
const cache = require('../config/cache');

const DEFAULTS = {
  general: {
    siteName: 'Derivion LMS',
    siteDescription: 'Learn. Grow. Succeed.',
    contactEmail: 'support@derivion.com',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    language: 'English',
  },
  enrollment: {
    allowSelfRegistration: false, // accounts are issued by admins / teachers
    requireEmailVerification: false,
    allowGuestBrowsing: true,
    maxEnrollmentsPerUser: 50,
  },
};

const GROUPS = Object.keys(DEFAULTS);
const CACHE_KEY = 'settings:all';

const sanitize = (group, input) => {
  const base = DEFAULTS[group];
  const out = {};
  for (const [key, def] of Object.entries(base)) {
    if (input?.[key] === undefined) continue;
    if (typeof def === 'boolean') out[key] = input[key] === true || input[key] === 'true';
    else if (typeof def === 'number') {
      const n = parseInt(input[key], 10);
      if (!Number.isNaN(n) && n >= 0) out[key] = n;
    } else out[key] = String(input[key]).trim().slice(0, 500);
  }
  return out;
};

const getSettings = async () =>
  cache.wrap(CACHE_KEY, 60, async () => {
    const rows = await prisma.siteSettings.findMany({ where: { key: { in: GROUPS } } });
    const stored = Object.fromEntries(rows.map((r) => {
      try { return [r.key, JSON.parse(r.value)]; } catch { return [r.key, {}]; }
    }));
    const merged = {};
    for (const g of GROUPS) merged[g] = { ...DEFAULTS[g], ...sanitize(g, stored[g]) };
    return merged;
  });

const updateSettings = async (patch) => {
  const current = await getSettings();
  for (const g of GROUPS) {
    if (!patch?.[g]) continue;
    const next = { ...current[g], ...sanitize(g, patch[g]) };
    await prisma.siteSettings.upsert({
      where: { key: g },
      create: { key: g, value: JSON.stringify(next) },
      update: { value: JSON.stringify(next) },
    });
  }
  await cache.del(CACHE_KEY);
  return getSettings();
};

// Subset that is safe to expose to anonymous visitors
const getPublicSettings = async () => {
  const s = await getSettings();
  return {
    siteName: s.general.siteName,
    siteDescription: s.general.siteDescription,
    contactEmail: s.general.contactEmail,
    currency: s.general.currency,
    allowSelfRegistration: s.enrollment.allowSelfRegistration,
    requireEmailVerification: s.enrollment.requireEmailVerification,
    allowGuestBrowsing: s.enrollment.allowGuestBrowsing,
  };
};

module.exports = { getSettings, updateSettings, getPublicSettings, DEFAULTS };
