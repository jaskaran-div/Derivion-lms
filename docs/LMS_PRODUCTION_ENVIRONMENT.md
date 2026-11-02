# LMS: production environment variables

File on the server: `<LMS_DIR>/backend/.env` (never committed, mode 600). Frontend build-time variables are in the frontend
section at the end. Names below were extracted from the code (`process.env.*`), not assumed. **Add new variables by appending;
never overwrite or replace the existing file.** Placeholders look like `<THIS>`; no real secret appears in this document.

Legend: **M** mandatory in production · **O** optional · **I** only for the Operations integration (inert while unset).
"Matches Operations?" = **IDENTICAL** (must be the very same value in both apps), **PAIR** (the two apps' values must point at each other),
**DIFFERENT** (must not be reused in the other app), or **no**.

## Core
| Variable | Req | Example / format | Where to get it | Matches Operations? |
|---|---|---|---|---|
| `NODE_ENV` | M | `production` | fixed | no |
| `PORT` | O (default 5000) | `5000` | must equal the port your LMS Nginx `proxy_pass` uses. **Operations also defaults to 5000: they cannot share it.** | no (must be **different** ports) |
| `LOG_LEVEL` | O | `info` | | no |
| `APP_NAME` | O | `Derivion Learning Hub` | | no |
| `APP_URL` | M | `https://lms.derivion.in` | public address of the LMS site (used in email links) | no |
| `CLIENT_URL` | M | `https://lms.derivion.in` (comma-separated list allowed) | **CORS allow-list** for browsers calling the API | no |
| `BACKEND_URL` | O | `https://lms.derivion.in` | public address of the API (used for upload URLs) | no |
| `ADMIN_EMAIL` | O | `support@derivion.in` | shown as the support contact in emails | no |

## Database (Supabase stays)
| Variable | Req | Example / format | Where to get it |
|---|---|---|---|
| `DATABASE_URL` | M | `postgresql://…:6543/…?pgbouncer=true&connection_limit=5` | Supabase → transaction pooler. **Unchanged by this deployment.** |
| `DIRECT_URL` | M | `postgresql://…:5432/…` | Supabase → session/direct connection. **Used by `prisma migrate`.** |

## Authentication
| Variable | Req | Example / format | Notes |
|---|---|---|---|
| `JWT_SECRET` | M | 64+ random chars | **DIFFERENT** from Operations' `JWT_SECRET`. Do not change on a live system (signs out everyone). |
| `JWT_REFRESH_SECRET` | M | 64+ random chars | different from `JWT_SECRET` |
| `JWT_EXPIRES_IN` | O (default `15m`) | `15m` | access token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | O (default `7d`) | `7d` | refresh lifetime |
| `ENABLE_FORGOT_PASSWORD` | O | `true` | existing switch for the password-reset email flow |

Cookie behaviour (from the code): in production the refresh cookie is `httpOnly`, `Secure`, `SameSite=None`, path `/api/auth`. It therefore **requires HTTPS** and `NODE_ENV=production`.

## Email (existing Gmail SMTP stays)
| Variable | Req | Example | Notes |
|---|---|---|---|
| `SMTP_HOST` | O (default `smtp.gmail.com`) | | |
| `SMTP_PORT` | O (default `587`) | `587` | 465 switches to implicit TLS |
| `SMTP_USER` | M | Gmail address | |
| `SMTP_PASS` | M | Gmail app password | |
| `FROM_EMAIL` | O (default `SMTP_USER`) | | |
| `FROM_NAME` | O | `Derivion Learning Hub` | |
| `EMAIL_PROVIDER` | O (default `smtp`) | `smtp` | leave as is |
| `EMAIL_MAX_ATTEMPTS` | O (default 5) | `5` | attempts per queued email before FAILED |

## Razorpay (existing)
| Variable | Req | Notes |
|---|---|---|
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | M | live keys stay as they are |
| `RAZORPAY_WEBHOOK_SECRET` | M | must equal the secret configured in the Razorpay dashboard webhook |
| `RAZORPAY_CONFIG_STANDARD`, `RAZORPAY_CONFIG_EMI` | O | existing checkout configuration ids |

## Existing storage / cache / monitoring (unchanged by this work)
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET`, `CLOUDFRONT_DOMAIN`, `CLOUDFRONT_KEY_PAIR_ID`, `CLOUDFRONT_PRIVATE_KEY_PATH` (course videos/files; O),
`REDIS_URL` (O: shared rate limits/cache), `SENTRY_DSN`, `SENTRY_TRACES_SAMPLE_RATE` (O), `BACKUP_KEEP`, `BACKUP_TO_S3` (O: `scripts/backup-db.js`).

## Operations integration (all new; **I**)
| Variable | Req | Example / format | Matches Operations? |
|---|---|---|---|
| `OPERATIONS_API_URL` | I | `https://operations.derivion.in` (no trailing slash) | **PAIR** with Operations' public URL. **Leave empty on the first restart: it keeps the integration OFF.** |
| `OPERATIONS_PUBLIC_URL` | I (defaults to `OPERATIONS_API_URL`) | `https://operations.derivion.in` | base of the onboarding links learners receive |
| `LMS_INTEGRATION_SECRET` | I | 96 hex chars (`openssl rand -hex 48`) | **IDENTICAL** to Operations' `LMS_INTEGRATION_SECRET` |
| `LMS_INTEGRATION_SECRET_PREVIOUS` | O | | only while rotating the secret |
| `ONBOARDING_TOKEN_SECRET` | I | 96 hex chars | **DIFFERENT / LMS-only**: never copy it to Operations. Generated on the LMS server. Changing it invalidates unused links. |
| `ONBOARDING_TOKEN_TTL_DAYS` | O (default 30, max 365) | `30` | no |
| `LEARNER_SYNC_SWEEP` | O (default off) | `off` | historical backfill; keep `off` until tested |
| `ONBOARDING_REMINDER_DAYS` | O (default off) | `3,7` | onboarding reminder emails; empty = none |
| `INVOICE_COMPANY_NAME` | O | your registered name | invoice header (defaults to `APP_NAME`) |
| `INVOICE_COMPANY_ADDRESS` | O | `Line 1\|Line 2\|City PIN` | `\|` separates lines |
| `INVOICE_TAX_ID` / `INVOICE_TAX_LABEL` | O | your GSTIN / `GSTIN` | printed only when set |
| `INVOICE_TAX_RATE` | O | `18` | printed only when set (prices treated as tax-inclusive) |
| `WORKER_INTERVAL_MS` | O (default 5000) | `5000` | worker poll interval |
| `WORKER_HOUSEKEEPING_MS` | O (default 60000) | | |

**Leave unset** for the first deployment: `QUEUE_DRIVER`, `SQS_EVENTS_QUEUE_URL`, `SQS_EMAIL_QUEUE_URL`, `SQS_DLQ_URL` (SQS is not used; the database outbox + worker is).
`WSL_DISTRO` is a developer-only helper.

## Frontend (Next.js) build-time variables
Set in `<LMS_DIR>/frontend/.env.production` (or `.env.local`) **before `npm run build`**; they are baked into the build:
| Variable | Req | Example |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | M | `https://lms.derivion.in/api` (the repo's `.env.example` still shows an old onrender URL: do not copy it) |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | M | the **public** Razorpay key id |
| `NEXT_PUBLIC_APP_NAME` | O | |

## Values that must be identical or paired across the two apps
| Item | LMS | Operations |
|---|---|---|
| Integration secret | `LMS_INTEGRATION_SECRET` | `LMS_INTEGRATION_SECRET` (**identical**) |
| Where Operations lives | `OPERATIONS_API_URL`, `OPERATIONS_PUBLIC_URL` | its public URL |
| Where the LMS lives | its public URL | `LMS_API_URL` (e.g. `https://lms.derivion.in`; the code appends `/api/integrations/...`) |
| Server clock | NTP-synchronized (signatures are rejected beyond ±5 minutes) | same machine, so the same clock |
Must **differ**: `JWT_SECRET`, `JWT_REFRESH_SECRET` vs Operations' `JWT_SECRET`; `ONBOARDING_TOKEN_SECRET` exists only in the LMS; the two backends need different `PORT`s.
