/**
 * Settings for the Operations integration, read lazily so tests (and a restart-free .env fix) see current values.
 * The integration is OFF unless every required value is present, and while it is off the LMS behaves exactly as before.
 */
const env = () => process.env;

const secrets = () => [env().LMS_INTEGRATION_SECRET, env().LMS_INTEGRATION_SECRET_PREVIOUS].filter(Boolean);

const config = () => {
  const e = env();
  const apiUrl = (e.OPERATIONS_API_URL || '').replace(/\/+$/, '');
  return {
    apiUrl,
    publicUrl: (e.OPERATIONS_PUBLIC_URL || apiUrl).replace(/\/+$/, ''),
    secret: e.LMS_INTEGRATION_SECRET || '',
    tokenSecret: e.ONBOARDING_TOKEN_SECRET || '',
    tokenTtlDays: Math.min(365, Math.max(1, parseInt(e.ONBOARDING_TOKEN_TTL_DAYS, 10) || 30)),
    appName: e.APP_NAME || 'Derivion Learning Hub',
    supportEmail: e.ADMIN_EMAIL || e.SMTP_USER || '',
  };
};

const isEnabled = () => {
  const c = config();
  return Boolean(c.apiUrl && c.secret.length >= 32 && c.tokenSecret.length >= 32);
};

module.exports = { config, isEnabled, secrets };
