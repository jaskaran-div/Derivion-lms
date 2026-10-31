# Deployment guide: Operations + LMS integration

You run every command below yourself. Nothing here has been run. Replace `<PLACEHOLDERS>`; never paste passwords, secrets or
`.env` contents into chat or into Git. The detailed server runbook for Operations lives in the **Operations repository**
(`docs/DEPLOY-OPERATIONS.md`); this guide sequences everything and covers the LMS side and the end-to-end test.

## 0. Read this first: what can happen when

| Track | What | Touches the live LMS / its database? | When |
|---|---|---|---|
| **A. Operations** | new subdomain, new EC2 instance, new database, deploy from GitHub, HTTPS, signed-connection checks | **No** | now, after you push the Operations repo |
| **B. LMS integration branch** | merge, `prisma migrate deploy`, env vars, restart, worker | **Yes**: schema change + restart | **only after the Supabase → EC2 migration rehearsal is completed and you approve** |

**Why B must wait.** The branch adds one *additive* Prisma migration (6 new tables, 2 new columns on `enrollments`). The
generated Prisma client selects those columns in every enrollment query, so the new code **cannot run against the current
Supabase schema without the migration**. There is no "deploy the code but skip the migration" option. You asked that the live
database stay unchanged until the migration rehearsal is approved, so Track B is held until then.

**Before you push Operations:** it has **one uncommitted change** from me (`backend/services/lmsSync.js`, accepts
`payment_status: NOT_APPLICABLE` and `onboarding_required: false`). Commit it with the rest. Without it, free/manual enrollments
and the backfill are rejected by Operations with a validation error.

Order: **A1 → A2 → A3 → A4 → A5 (connection checks without the LMS)** … later, after approval: **B (LMS deploy) → C (end-to-end test) → D (enable backfill)**.

---

## A. Operations (no change to the live LMS)

### A1. Subdomain `operations.derivion.in`
Follow Operations runbook **Stage 0.3**: create an **A record** `operations` → the Elastic IP of the new instance (TTL 300) at the place
`derivion.in` DNS is managed. Do **not** touch the `lms` record. Verify from your PC: `nslookup operations.derivion.in`.
Rollback: delete the record.

### A2. Launch and configure the EC2 instance
Operations runbook **Stages 0.2, 1, 2**: Ubuntu 24.04, t3.small, 30 GB gp3, same region as the LMS; security group with **22 from your IP only**,
80 and 443 public, **nothing else (no 5432, no 5000)**; Elastic IP; install Node 22, Nginx, PostgreSQL 16, PM2, certbot.
Check the clock is synchronized (`timedatectl | grep synchronized` → yes): the signed API rejects requests more than 5 minutes off.

### A3. Deploy Operations from GitHub
After you create the (private) Operations repo and push `main` (including the uncommitted change above):
**Stages 3 → 6 → 8** of the runbook: database `derivion_operations` and role `ops_app` (Stage 3), read-only deploy key + `git clone` (Stage 4),
`.env` with secrets generated on the server (Stage 5), `npm ci`, `npm run migrate`, create the admin (Stage 6), first deploy script (Stage 8).
Expected: `pm2 status` shows **operations-api** and **operations-worker** online; `curl -s http://127.0.0.1:5000/api/health` returns `{"status":"ok",…}`.
The worker logs "LMS_API_URL … not set": expected until A5.

### A4. Nginx and HTTPS
Runbook **Stages 7 and 9**: install `deploy/nginx-operations.conf`, `nginx -t`, reload; `certbot --nginx -d operations.derivion.in --redirect`.
Verify: `curl -s https://operations.derivion.in/api/health`; `curl -sI http://operations.derivion.in` → 301; `sudo certbot renew --dry-run`.
Run the runbook's **Stage 10** security checks (staff API 401 without login, integration API 401 without signature, PostgreSQL not reachable from your PC).

### A5. Prepare the connection (still without touching the LMS)
1. **The shared secret already exists** on the Operations server (generated in Stage 5, never displayed). When you reach B4 you will copy that one
   value into the LMS `.env`. To read it on **your own terminal** (not in chat): `grep '^LMS_INTEGRATION_SECRET=' ~/apps/isft-operations/backend/.env`.
2. **Prove Operations accepts a signed request and rejects a forged one, from the Operations server itself** (the smoke tool ships in the LMS repo,
   so for now run it from your PC with the LMS repo checked out, pointing at the public URL):
   ```
   cd <your PC>\derivion-lms\backend
   $env:OPERATIONS_API_URL = "https://operations.derivion.in"
   $env:LMS_INTEGRATION_SECRET = Read-Host "Paste the secret" -MaskInput     # typed hidden, not stored in history
   node scripts\integration-smoke.js ping            # expect: HTTP 200 ... "OK: Operations accepted the signature"
   node scripts\integration-smoke.js bad-signature   # expect: HTTP 401 ... "OK: a forged request is rejected"
   Remove-Item Env:LMS_INTEGRATION_SECRET            # clear it afterwards
   ```
   Optional: `node scripts\integration-smoke.js learner` creates **one** labelled test learner ("Integration Smoke Test", source `smoke_test`) so you can
   see it on the Operations **Learners** page. It stays in the Operations database; only run it if you accept that.
3. Sign in to `https://operations.derivion.in` as the admin → **Integrations**: it shows "LMS connection: not configured" (correct). Ordinary staff do not see this menu entry.

Troubleshooting: `401` on `ping` = secret mismatch or clock skew; `503` = Operations has no `LMS_INTEGRATION_SECRET`; timeout = security group or Nginx.

---

## B. LMS integration branch (hold until the Supabase migration is approved)

Branch: **`feature/learner-lifecycle-integration`** on GitHub. It must **not** be merged blindly into the production branch.

### B0. Identify the existing deployment setup (read-only, changes nothing)
```
ssh -i <KEY> <USER>@<LMS_SERVER>
pm2 ls                                              # note the names of the web/api/frontend processes
pm2 describe <NAME> | grep -E "exec cwd|script path"   # the real app directory of each
cd <LMS_DIR>
git remote -v && git branch --show-current && git status --short && git log --oneline -3
node -v
sudo nginx -T 2>/dev/null | grep -E "server_name|proxy_pass"   # how /api is proxied
grep -c . backend/.env                              # only counts lines; do NOT cat the file
```
Tell me the branch name (`<PROD_BRANCH>`), the directory and the PM2 names; the commands in B3-B6 use them.

### B1. How the merge should work
1. On GitHub open a **Pull Request** `feature/learner-lifecycle-integration` → `<PROD_BRANCH>`. Read the diff and let your CI (`.github/workflows/ci.yml`) run.
2. Merge it (a normal merge commit keeps the history readable). Your uncommitted "Learning Hub" rename edits are **not** in the branch; commit them separately when you wish.
3. Nothing changes on the server until you run `git pull` there (B4).

### B2. Back up first (before any change)
```
mkdir -p ~/backups && cd <LMS_DIR>
git rev-parse HEAD > ~/backups/lms-previous-commit-$(date +%F).txt      # the commit to return to
cp backend/.env ~/backups/lms-env-$(date +%F) && chmod 600 ~/backups/lms-env-$(date +%F)
# database dump (read-only against the DB; the URL is read from the file, never printed):
export DIRECT_URL="$(grep '^DIRECT_URL=' backend/.env | cut -d= -f2- | tr -d '"')"
pg_dump "$DIRECT_URL" -Fc -f ~/backups/lms-pre-integration-$(date +%F-%H%M).dump && ls -lh ~/backups/lms-pre-integration-*.dump
unset DIRECT_URL
```
Expect a non-empty `.dump`. (If `pg_dump` is missing: `sudo apt install -y postgresql-client`.) Keep the dump off the server too (S3 or your PC).

### B3. Staged enable: deploy the code with the integration still OFF
The integration does nothing while `OPERATIONS_API_URL` is empty, so deploy in two steps: first prove the app behaves exactly as before, then switch the integration on.
```
cd <LMS_DIR>
git fetch origin && git log --oneline HEAD..origin/<PROD_BRANCH>      # review what will arrive
git pull --ff-only origin <PROD_BRANCH>
cd backend && npm ci                                                  # postinstall runs prisma generate
npx prisma migrate status                                             # read-only: expect 1 pending: 20261101000000_learner_lifecycle_integration
```

### B4. Apply the additive migration (THIS CHANGES THE DATABASE)
```
npx prisma migrate deploy
```
Expect "1 migration applied". It creates 6 tables and adds `onboardingStatus` (default `NOT_APPLICABLE`) and `onboardingCompletedAt` to `enrollments`;
no row is rewritten or deleted. Do **not** use `migrate dev`, `db push` or `migrate reset`. Verify: `npx prisma migrate status` → "up to date".

### B5. Environment variables (append; never overwrite the file)
Names and meaning are in `backend/integration.env.example`. **Step 1 (integration still off):** add only the safe ones:
```
cd <LMS_DIR>/backend
echo "ONBOARDING_TOKEN_SECRET=$(openssl rand -hex 48)" >> .env      # LMS-only secret, generated here, never shown
echo "ONBOARDING_TOKEN_TTL_DAYS=30"                    >> .env
echo "LEARNER_SYNC_SWEEP=off"                          >> .env      # backfill stays OFF
nano .env      # add INVOICE_COMPANY_NAME / INVOICE_COMPANY_ADDRESS (lines separated by |) / INVOICE_TAX_ID / INVOICE_TAX_RATE with YOUR real details
```
Invoices print company and tax details **only** from these values; nothing is invented. Leave `INVOICE_TAX_ID` and `INVOICE_TAX_RATE` out if they do not apply.
**Step 2 (switch the integration on, after Step 1 is verified):** add
```
OPERATIONS_API_URL=https://operations.derivion.in
OPERATIONS_PUBLIC_URL=https://operations.derivion.in
LMS_INTEGRATION_SECRET=<the value from the Operations server, pasted by you with nano>
```
Also on the **Operations** server set `LMS_API_URL=https://lms.derivion.in` in `backend/.env` and `pm2 restart operations-worker --update-env`.
Both servers must agree on the secret and their clocks.

### B6. Build and restart
```
cd <LMS_DIR>/frontend && npm ci && npm run build                      # use your normal frontend build
pm2 restart <WEB_API_NAME> --update-env && pm2 restart <FRONTEND_NAME> --update-env
pm2 start src/workers/index.js --name lms-worker --cwd <LMS_DIR>/backend && pm2 save
pm2 logs lms-worker --lines 20 --nostream                              # expect: [worker] started (integration disabled …) in Step 1
curl -s https://lms.derivion.in/api/health
```
Step 1 acceptance: the site works as before: log in, browse, an existing enrollment opens; admin sees **Analytics → Emails & Sync**.
Then do Step 2 of B5 and `pm2 restart <WEB_API_NAME> lms-worker --update-env`; the worker log now says `integration ENABLED`.
Verify the connection from the LMS server: `cd <LMS_DIR>/backend && node scripts/integration-smoke.js ping` → HTTP 200. Operations **Integrations** now shows "LMS connection: connected".

### B7. Rollback
* **Switch the integration off instantly (recommended first response):** remove/blank `OPERATIONS_API_URL`, `pm2 restart <WEB_API_NAME> lms-worker --update-env`. The app returns to its previous behaviour; queued events simply wait.
* **Code:** `git checkout $(cat ~/backups/lms-previous-commit-<DATE>.txt)`, `cd backend && npm ci`, restart PM2. The new tables/columns are additive and harmless to the old code, so no database rollback is needed.
* **Database:** restoring `~/backups/lms-pre-integration-….dump` is a last resort and loses anything written since the dump.

---

## C. End-to-end test (use accounts you control; start with the integration enabled and the backfill OFF)

Where to look: Operations **Integrations** (Overview, Events from/to LMS, Email history) and **Learners**; LMS **Analytics → Emails & Sync**.

| # | Do | Expect |
|---|---|---|
| 1 | Register a new learner (a real mailbox you own), enter the OTP | Within ~10 s the learner is on Operations **Learners** as *Registered*; Operations **Events from LMS** shows `learner.verified` PROCESSED |
| 2 | **Operations down:** `pm2 stop operations-api` on the Operations server; register a second learner; look at LMS **Sync events** | event is PENDING with an error and a next-attempt time; after `pm2 start operations-api` it is delivered within the backoff window and the learner appears; no duplicate |
| 3 | Enroll the first learner in a **free** course | email "You are enrolled…" with **no amount and no invoice**; Operations shows the enrollment with payment *NOT_APPLICABLE* and a working onboarding link |
| 4 | Buy a **paid** course (cheapest real course, or Razorpay test mode if available) | verified webhook → enrollment; email with course, enrollment ID, amount, payment reference, **invoice PDF** and link; Operations enrollment *PAID* with invoice number |
| 5 | Open the link: form prefilled with name/email/phone; upload a photo (preview shows); submit | Operations enrollment *Onboarding completed*; **Events to LMS** `onboarding.completed` SENT; LMS enrollment becomes completed; learner gets "Onboarding received" |
| 6 | Same learner buys/enrolls in a second course | a **new** enrollment on the same learner; short form (course-specific questions, declaration, review); general onboarding stays *completed* |
| 7 | Admin **refunds** the paid test purchase | refund email once; Operations enrollment *REFUNDED*; refund event PROCESSED |
| 8 | Email failure: in LMS **Emails & Sync** use **Retry** on any FAILED email (or temporarily break SMTP in a test only) | the email goes back to PENDING and is sent once; Operations **Email history** updates |
| 9 | Security: `curl -s -o /dev/null -w "%{http_code}\n" https://operations.derivion.in/api/integrations/lms/ping` and the same for `https://lms.derivion.in/api/integrations/operations/ping` | both `401`; staff (non-admin) cannot open Integrations |

Read-only checks on the LMS database (`psql` with the URL from the env; these only SELECT):
`SELECT status, count(*) FROM outbox_events GROUP BY 1;` · `SELECT status, count(*) FROM email_logs GROUP BY 1;` · `SELECT count(*) FROM invoices;`
Healthy: no `DEAD` events, no `FAILED` emails (or each has an understood cause).
Duplicate webhooks cannot be reproduced on demand against live Razorpay (Razorpay's dashboard can re-send a webhook; the automated tests cover this).
A real Gmail send is verified here, in tests 1, 3 and 4. Gmail allows roughly 500 messages/day, ample for this stage.

## D. Enable the backfill deliberately (only after C passes)
1. Decide the moment. In `backend/.env` set `LEARNER_SYNC_SWEEP=on`, then `pm2 restart lms-worker --update-env`.
2. The worker announces existing eligible learners (100 per minute) and their existing enrollments as **history only**: no links, no emails; Operations marks those enrollments "onboarding not required".
3. Watch `pm2 logs lms-worker` ("queued N learner(s)…") and Operations **Overview** counts. To pause: set `LEARNER_SYNC_SWEEP=off` and restart the worker; announced learners stay, the rest wait.

## E. Not part of this first deployment
SQS, CloudWatch and the queue switch stay **off** (`QUEUE_DRIVER` unset = tested database outbox + worker). The prepared files are in `deploy/aws/` for a later, separately approved step.
The Supabase → EC2 database migration, its rehearsal, and the cutover are a separate phase with their own approval.
