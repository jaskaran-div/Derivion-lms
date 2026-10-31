# AWS preparation: SQS, dead-letter queue, workers, CloudWatch

**Nothing in this folder has been run.** It prepares the production architecture; you run the AWS commands yourself, after approving.

## What is implemented in code vs. what still needs AWS

| Piece | In the code (tested) | Still requires AWS / your action |
|---|---|---|
| Transactional outbox + email queue in PostgreSQL | ✅ the default and the source of truth; works without any AWS service | – |
| Polling worker (`node src/workers/index.js`) | ✅ retries, backoff, dead-letter state, SKIP LOCKED so several workers are safe | run it under PM2 (below) |
| SQS relay, consumers, dead-letter sweeper (`QUEUE_DRIVER=sqs`) | ✅ tested against a real database with an **in-memory fake of SQS** (redelivery, redrive to DLQ, lost messages, duplicates) | create the 3 queues, redrive policy, IAM permissions; install `@aws-sdk/client-sqs`; **smoke-test against real SQS** (never done) |
| Credentials | ✅ default AWS credential chain; no keys in code or `.env` | attach an IAM role to the EC2 instance |
| Structured logs | ✅ worker + API log to the PM2 log files | install the CloudWatch agent with `cloudwatch-agent.json` |
| Metrics / alarms | – | create the alarms listed below |

Design in one paragraph: the database stays the source of truth for retry state. In SQS mode the worker *relays* due rows to
SQS, a *consumer* delivers them and records the result on the row (SENT, or PENDING with exponential backoff, or DEAD/FAILED),
and the queue's redrive policy moves poison messages to the DLQ, where a sweeper marks the row DEAD/FAILED so it appears on
the admin screen. A lost SQS message cannot lose an event: a row stuck in PROCESSING/SENDING for 10 minutes is claimed again.

## 1. Create the queues (run on your PC with the AWS CLI configured for the right account/region)

```bash
export AWS_REGION=<same region as the LMS server>
bash deploy/aws/create-queues.sh        # prints the three queue URLs and ARNs
```
The script creates `derivion-lms-dlq` (14-day retention) and two standard queues, `derivion-lms-events` and `derivion-lms-email`,
each with a 60-second visibility timeout and a redrive policy that moves a message to the DLQ after 5 failed receives.
It refuses to continue if a queue with that name already exists.

## 2. IAM permissions for the LMS server

Attach [`iam-policy-lms-worker.json`](iam-policy-lms-worker.json) (after replacing `<REGION>` and `<ACCOUNT_ID>`) to the IAM
**role** of the LMS EC2 instance. It allows only `SendMessage`, `ReceiveMessage`, `DeleteMessage` and `GetQueueAttributes` on
those three queues. No access keys are created or stored anywhere.

> The current LMS host is described as EC2. If any part still runs somewhere without an instance role, tell me before enabling SQS.

## 3. Enable on the server (after the code is deployed)

1. `cd` to the LMS backend and install the SDK. **This changes `package.json` / `package-lock.json`, so it is held for your approval:**
   `npm install @aws-sdk/client-sqs`
2. Add to the LMS `.env` (names from `backend/integration.env.example`): `QUEUE_DRIVER=sqs`, `AWS_REGION`, `SQS_EVENTS_QUEUE_URL`, `SQS_EMAIL_QUEUE_URL`, `SQS_DLQ_URL`.
3. Start the worker as its own process, separate from the web server:
   `pm2 start src/workers/index.js --name lms-worker --cwd /path/to/derivion-lms/backend && pm2 save`
4. Verify: `pm2 logs lms-worker --lines 30`, then make one test purchase and watch the three queues drain
   (`aws sqs get-queue-attributes --queue-url <url> --attribute-names ApproximateNumberOfMessages`).
5. **Rollback:** set `QUEUE_DRIVER=db` (or remove it) and `pm2 restart lms-worker --update-env`. Rows in flight are claimed
   again by the polling worker after the 10-minute lock expires; nothing is lost.

## 4. CloudWatch

* **Logs and host metrics:** install the CloudWatch agent on each server and load [`cloudwatch-agent.json`](cloudwatch-agent.json)
  (log groups `derivion/lms/worker`, `derivion/lms/api`, `derivion/operations/api`, `derivion/operations/worker`, `derivion/nginx/*`;
  memory and disk metrics). The instance role needs the AWS-managed policy `CloudWatchAgentServerPolicy`.
  ```bash
  sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -c file:/path/to/cloudwatch-agent.json -s
  ```
* **Alarms to create** (console or CLI; all should notify an SNS topic you subscribe to):
  | Alarm | Metric | Threshold |
  |---|---|---|
  | Dead-lettered messages | `AWS/SQS ApproximateNumberOfMessagesVisible`, queue `derivion-lms-dlq` | `> 0` for 1 period |
  | Events not draining | `ApproximateAgeOfOldestMessage`, queue `derivion-lms-events` | `> 900` seconds |
  | Emails not draining | `ApproximateAgeOfOldestMessage`, queue `derivion-lms-email` | `> 900` seconds |
  | Disk filling | `CWAgent disk_used_percent` | `> 80` |
  | Memory | `CWAgent mem_used_percent` | `> 85` |
  | Worker errors | metric filter on `derivion/lms/worker` for `batch failed` | `>= 3` in 5 minutes |
  | Backup failure | metric filter on the backup log group for anything but `backup OK` for 26 hours | alarm on missing data |
* Operations' own dead-letter state is visible on its **Integrations → Events to LMS** screen; the LMS side on **Emails & Sync**.

## Not done / needs a decision
* No real-SQS smoke test has been run (needs the queues above).
* `@aws-sdk/client-sqs` is not yet a dependency (would modify your `package.json`).
* Operations does not use SQS: its `onboarding.completed` events go straight to the LMS through its own outbox + worker, which is sufficient at this scale.
