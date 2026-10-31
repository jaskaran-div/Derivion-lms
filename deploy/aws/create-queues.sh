#!/usr/bin/env bash
# Creates the SQS queues for the LMS <-> Operations integration. RUN BY YOU, never by the deploy process.
# Needs the AWS CLI configured for the target account, and AWS_REGION set.
set -euo pipefail
: "${AWS_REGION:?Set AWS_REGION, e.g. export AWS_REGION=ap-south-1}"

DLQ_NAME="${DLQ_NAME:-derivion-lms-dlq}"
EVENTS_NAME="${EVENTS_NAME:-derivion-lms-events}"
EMAIL_NAME="${EMAIL_NAME:-derivion-lms-email}"
MAX_RECEIVES="${MAX_RECEIVES:-5}"

exists() { aws sqs get-queue-url --queue-name "$1" --region "$AWS_REGION" >/dev/null 2>&1; }
for q in "$DLQ_NAME" "$EVENTS_NAME" "$EMAIL_NAME"; do
  if exists "$q"; then echo "Queue $q already exists - refusing to continue."; exit 1; fi
done

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

echo "Creating dead-letter queue $DLQ_NAME"
DLQ_URL="$(aws sqs create-queue --queue-name "$DLQ_NAME" --region "$AWS_REGION" \
  --attributes MessageRetentionPeriod=1209600 --query QueueUrl --output text)"
DLQ_ARN="$(aws sqs get-queue-attributes --queue-url "$DLQ_URL" --region "$AWS_REGION" \
  --attribute-names QueueArn --query Attributes.QueueArn --output text)"

# Redrive policy is a JSON string inside JSON; write it to a file to avoid shell-quoting mistakes
python3 - "$DLQ_ARN" "$MAX_RECEIVES" "$TMP/attrs.json" <<'PY'
import json, sys
arn, max_receives, out = sys.argv[1], sys.argv[2], sys.argv[3]
json.dump({
    "VisibilityTimeout": "60",
    "MessageRetentionPeriod": "345600",
    "RedrivePolicy": json.dumps({"deadLetterTargetArn": arn, "maxReceiveCount": max_receives}),
}, open(out, "w"))
PY

for name in "$EVENTS_NAME" "$EMAIL_NAME"; do
  echo "Creating queue $name (moves to the DLQ after $MAX_RECEIVES failed receives)"
  aws sqs create-queue --queue-name "$name" --region "$AWS_REGION" --attributes "file://$TMP/attrs.json" >/dev/null
done

echo
echo "Done. Put these in the LMS .env (QUEUE_DRIVER=sqs):"
for pair in "SQS_EVENTS_QUEUE_URL:$EVENTS_NAME" "SQS_EMAIL_QUEUE_URL:$EMAIL_NAME" "SQS_DLQ_URL:$DLQ_NAME"; do
  var="${pair%%:*}"; name="${pair#*:}"
  echo "$var=$(aws sqs get-queue-url --queue-name "$name" --region "$AWS_REGION" --query QueueUrl --output text)"
done
echo "AWS_REGION=$AWS_REGION"
echo
echo "Queue ARNs for the IAM policy:"
for name in "$EVENTS_NAME" "$EMAIL_NAME" "$DLQ_NAME"; do
  url="$(aws sqs get-queue-url --queue-name "$name" --region "$AWS_REGION" --query QueueUrl --output text)"
  aws sqs get-queue-attributes --queue-url "$url" --region "$AWS_REGION" --attribute-names QueueArn --query Attributes.QueueArn --output text
done
