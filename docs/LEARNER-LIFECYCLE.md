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

## Paid vs free / manually created enrollments

| | Paid purchase | Free course | Admin-enrolled | Teacher / bulk (school) |
|---|---|---|---|---|
| Payment row, invoice | ✅ | ❌ none | ❌ none | ❌ none |
| Event to Operations | `payment.successful` (amount, reference, invoice no.) | `enrollment.created`, `payment_status: NOT_APPLICABLE`, `enrollment_source: free` | same, source `admin` | same, source `teacher` / `bulk` |
| Onboarding link + email | ✅ purchase & onboarding email (+ invoice PDF) | ✅ "enrollment-onboarding" email: no amount, no invoice | ✅ same email, "Added by Derivion" | ✅ only if the student has a real, verified email (normally a placeholder, so **nothing is synced or sent**) |
| Old generic "you have a new course" email | n/a (replaced) | n/a | **suppressed** for synchronized learners (in-app notification kept) | suppressed likewise |
| Learner not yet eligible (unverified / placeholder) | – | – | nothing sent; when they later verify, the enrollment is synced and (if recent, < 30 days) the onboarding email is sent | same |

Enrollments are announced exactly once (event id derived from the enrollment). A safety-net sweep repairs a missed hook for
enrollments made **after the integration was first switched on**; older enrollments are history and are only touched by the
backfill below.

## Backfill switch (`LEARNER_SYNC_SWEEP`, default **off**)
* **Off (first deployment):** existing learners and old enrollments are not announced. New verifications, new enrollments, purchases and refunds sync normally.
* **On (a deliberate step after testing):** the worker announces existing eligible learners (100 per minute) and their existing enrollments **as history only**: no onboarding link, no email, and Operations marks those enrollments "onboarding not required".

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
| Free-course enrollment (no payment, no invoice) | ✅ | ✅ E2E: no payment row/invoice, payment `NOT_APPLICABLE` in Operations, link + email |
| Admin-created enrollment; verified and unverified learner (catch-up at verification) | ✅ | ✅ E2E |
| Teacher-created / bulk enrollment (placeholder email) | ✅ never synced while placeholder | ✅ E2E (real `createStudent`, `enrollStudent`, `importStudents`) |
| Backfill switch off by default / on = history only, no emails | ✅ | ✅ E2E |
| Paid vs free distinguishable in Operations | ✅ | ✅ E2E |
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
| LMS admin screen "Emails & Sync" | ✅ `/admin/emails` | ✅ **real browser** (Edge): list, filters, retry email, retry dead event, audit entry, teacher blocked (403), traffic stays local |
| Operations **Integrations** dashboard (overview, LMS connectivity, events, outbound events, email history, retry) | ✅ admin only | ✅ API: 6 tests · ✅ **real browser**: staff cannot see or call it (403/401), connected status, event details/retry, outbound requeue, email retry with a signed request |
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
| LMS journey against real PostgreSQL + real Operations processes | 37 / 37 |
| LMS SQS transport (real DB, fake SQS) | 10 / 10 |
| Operations backend (security, learners, integration API, journey, dashboard) | 79 / 79 |
| Operations onboarding-form browser test (Edge headless, incl. uploaded photo preview) | 3 / 3 |
| LMS "Emails & Sync" browser check | 9 / 9 |
| Operations "Integrations" browser check (permissions + retries) | 11 / 11 |

Real defects the tests found while building this (all fixed): a time-zone bug in the queue queries (retries could fire hours
early or late depending on the database time zone), an unordered claim that could reorder a batch of emails, a cross-origin
image policy regression that hid uploaded photos, and the rupee glyph in the PDF.

## Pending / needs your decision
1. `@aws-sdk/client-sqs` is **not** a dependency (adding it would edit `package.json`). The first deployment keeps the tested database outbox + worker; SQS and CloudWatch stay prepared, not enabled.
2. Real SQS / CloudWatch have never been exercised.
3. **Operations has one uncommitted change** (`backend/services/lmsSync.js`: accept `payment_status: NOT_APPLICABLE` and `onboarding_required: false`). It must be committed and pushed with Operations before free/manual enrollments or the backfill are enabled.
4. A real Gmail send is untested (needs the production SMTP configuration).
5. The onboarding form pre-ticks one "reasons" checkbox by default (existing behaviour).
6. Cosmetic: two sentences run together on the Operations overview card.
7. Obsolete Render/Vercel references in the LMS repo are not cleaned up yet.

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
