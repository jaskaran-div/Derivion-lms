# Learner lifecycle: LMS ↔ Operations: completion report

Four states are kept apart on purpose: **Implemented** (code exists), **Tested** (an automated test exercises it, with the
kind of test named), **Pending** (not done or needs a decision), **Production-configured** (nothing: no server, database or
AWS resource has been touched).

## The journey

```
Verification (OTP / email link / password reset)  ─┐
Reconciliation sweep (any creation path)          ─┴► outbox: learner.verified ─► worker ─► Operations: learner REGISTERED
Razorpay webhook ─► ONE transaction: payment + enrollment + invoice + onboarding token + outbox event + email job
   email worker ─► purchase & onboarding email (invoice PDF + https://operations…/onboarding/<token>)
   outbox worker ► Operations: enrollment on the SAME learner (token hash only)
Learner opens link ─► Operations prefills, asks only what is missing ─► submit (one transaction)
   ─► Operations outbox + worker ─► LMS /api/integrations/operations/events ─► enrollment ONBOARDING_COMPLETED + confirmation email
```

## Decisions applied

| Decision | How it is implemented |
|---|---|
| Sync only real, valid, verified emails; LMS user id is the permanent key | `lifecycle.eligible()`: active STUDENT, `isEmailVerified`, syntactically valid, not a `@students.derivion.local` placeholder, not a reserved domain (`example.com/org/net`, `.invalid`, `.localhost`, `.local`, `.internal`). `lms_user_id` is unique in Operations. |
| All creation paths | Self-registration, email link and password reset sync at the moment of verification. **Admin-, teacher- and bulk-created** accounts are covered by a reconciliation sweep (worker, every minute) that announces any eligible learner nobody has announced yet, so a placeholder account that later gets a real, verified email syncs by itself. |
| Replace the enrollment email | With the integration on, the purchase/onboarding email replaces the old one for real-inbox learners (never both). With it off, behaviour is exactly as before. OTP, verification and password-reset emails are untouched. |
| Repeat purchases | New course → separate enrollment, separate invoice, own link, general onboarding in Operations stays COMPLETED; only course-specific answers + the per-enrollment declaration are asked again. |
| Duplicate payment | One enrollment; the second payment still gets its invoice and a confirmation email **without** a link; onboarding is not reset; nothing is sent to Operations; an audit entry is written. |

## Checklist

| Area | Implemented | Tested (how) |
|---|---|---|
| `learner.verified` on OTP verification | ✅ transactional outbox | ✅ real DB, E2E |
| Same for email link / password-reset verification | ✅ | ⚠ not individually covered by E2E (same code path as OTP; the old mocked auth tests still pass) |
| Admin-created learner | ✅ via sweep after first verified sign-in | ✅ E2E (not synced until the sign-in code is confirmed) |
| Teacher-created, bulk-imported learners | ✅ never synced while the email is a placeholder | ✅ E2E (real `createStudent` and `importStudents` controllers) |
| Placeholder → real verified email | ✅ sweep | ✅ E2E (unverified real email is not synced; verified one is, once) |
| Eligibility rules (invalid/reserved/unverified) | ✅ | ✅ unit-level assertions |
| Name/phone change by an admin → `learner.updated` | ✅ (learners cannot edit their own profile in this LMS) | ✅ E2E (same content saved twice → one event) |
| Verified payment → enrollment, invoice, token, event, email in one transaction | ✅ | ✅ E2E |
| Failed payment (`payment.failed` webhook) | ✅ FAILED once, learner email, audit, never downgrades a success | ✅ E2E (incl. later successful retry) |
| Successful payment, **duplicate webhooks** (sequential and 4 concurrent) | ✅ | ✅ E2E, 5 consecutive runs |
| First and second course purchase, same learner | ✅ | ✅ E2E + browser |
| Duplicate payment for an onboarded course | ✅ | ✅ E2E |
| Refund (event, refund email, enrollment revoked, Operations updated; repeated webhook = no-op) | ✅ | ✅ E2E |
| Re-purchase after refund restores the same enrollment | ✅ | ✅ E2E |
| Onboarding email: course, enrollment id, amount, status, reference, invoice PDF, personal link | ✅ | ✅ E2E (fake provider records the exact message) |
| Invoice PDF | ✅ number sequence, config-driven company/tax, PDF cached | ✅ generated + **visually inspected** (found and fixed: ₹ printed as a stray "1"; PDF now shows `INR`) |
| Invoice download (`GET /api/payments/:id/invoice`) | ✅ buyer or admin only | ✅ E2E |
| Onboarding form: prefilled, only missing steps shown, returning short form, photo upload, edit-from-review | ✅ | ✅ **real browser (Edge, headless), 3 tests + screenshots** |
| Submit updates the existing learner/enrollment; one-time link; race-safe | ✅ | ✅ unit + browser |
| `onboarding.completed` → LMS (signed), status updated, confirmation email once | ✅ | ✅ E2E |
| Retries, backoff, dead-letter, dedupe (outbox, email, inbound events) | ✅ | ✅ E2E: Operations down, email failure, replay of all events |
| Email status values + admin retry | ✅ PENDING / SENDING / SENT / FAILED | ✅ E2E (incl. retry **from the Operations dashboard** through the LMS) |
| LMS admin screen "Emails & Sync" | ✅ `/admin/emails` | ⚠ type-checked and linted; **not exercised in a browser** (needs a running LMS front end) |
| Operations **Integrations** dashboard (overview, LMS connectivity, events, outbound events, email history, retry) | ✅ admin only | ✅ API: 6 tests, incl. signed ping/retry; ⚠ screen itself built and linted, **not exercised in a browser** |
| Templates | ✅ purchase-onboarding, purchase-confirmation, refund-confirmation, payment-failed, onboarding-completed, onboarding-reminder | ✅ rendered and sent in E2E |
| Onboarding reminders | ✅ **off unless `ONBOARDING_REMINDER_DAYS` is set** (e.g. `3,7`) | ✅ E2E |
| Audit logs | ✅ payment verified (with kind), duplicate payment, failed/refunded, onboarding completed, admin retries | ✅ asserted in E2E |
| Fresh-database migration BOM problem | ✅ `scripts/init-fresh-db.js` (history file left untouched on purpose) | ✅ built a brand-new DB: schema identical to `schema.prisma`, 8 migrations recorded, second run refuses |
| SQS relay, consumers, DLQ sweeper | ✅ `QUEUE_DRIVER=sqs` | ✅ 10 tests with an in-memory fake SQS · ❌ never run against real SQS |
| CloudWatch, queues, IAM | ✅ prepared in `deploy/aws/` | ❌ not created or run |

Emails **not** implemented because the LMS has no such feature: assignment/lesson/announcement/live-session/feedback/certificate
emails, and security notifications (there is no password-change email today).

## Test inventory (all passing at the time of writing)

| Suite | Result |
|---|---|
| LMS unit tests (existing + updated mocks) | 50 / 50 |
| LMS journey against real PostgreSQL + real Operations processes | 28 / 28, five consecutive runs |
| LMS SQS transport (real DB, fake SQS) | 10 / 10 |
| Operations backend (security, learners, integration API, journey, dashboard) | 79 / 79 |
| Operations browser test (Edge headless) | 3 / 3 |

Real defects the tests found while building this (all fixed): a time-zone bug in the queue queries (retries could fire hours
early or late depending on the database time zone), an unordered claim that could reorder a batch of emails, a cross-origin
image policy regression that hid uploaded photos, and the rupee glyph in the PDF.

## Pending / needs your decision
1. **`server.js` needs one hunk** (raw-body capture for signature checks). It sits in a file that also holds your rename edits, so it is **not committed**: see the exact diff in the hand-over message.
2. `@aws-sdk/client-sqs` is not a dependency (adding it edits `package.json`).
3. Real SQS and CloudWatch have never been exercised (need the AWS resources).
4. Browser checks of the two admin screens.
5. The form pre-ticks "Trading & investment understanding" (existing default); you may want it empty for course-specific answers.
6. Re-purchase after a refund: if onboarding for that enrollment was already completed it is kept (confirmation email, no new link); if it was never completed a fresh link is issued.
7. Free-course and admin/teacher enrollments do not pass through payment, so they get no invoice, link or sync event (by design; say if you want them to).
8. On first enablement the sweep will announce **every existing eligible learner** to Operations (100 per minute). Tell me if you want a switch to hold that back.

## Production-configured
**Nothing.** No server, database, DNS or AWS resource has been changed. Enabling steps are in the hand-over message and in
`deploy/aws/README.md`, to be run by you after you push and approve.

## Enabling later (summary; exact commands are given only after you push)
1. Deploy Operations (runbook in its repo). 2. LMS `.env` (names in `backend/integration.env.example`). 3. Back up, then
`npx prisma migrate deploy` (one additive migration). 4. Restart the web process. 5. Start the worker:
`pm2 start src/workers/index.js --name lms-worker`. 6. Operations `.env`: `LMS_API_URL`. 7. One real test purchase.

## Running the opt-in tests
```
LMS_TEST_DATABASE_URL=postgresql://…@127.0.0.1:…/<disposable migrated LMS db>
OPS_TEST_ADMIN_URL=postgresql://…@127.0.0.1:…/postgres            # may CREATE DATABASE
node --test --test-concurrency=1 tests/learner-journey.e2e.test.js tests/sqs-transport.e2e.test.js
```
They refuse non-local databases, wipe the LMS test database's users/queues, and create/drop their own Operations database.
The browser test lives in the Operations repo (`e2e/`).
