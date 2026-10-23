// Database backup: pg_dump (custom format) of DIRECT_URL (or DATABASE_URL) into backend/backups/,
// keeping the newest BACKUP_KEEP files (default 14). With BACKUP_TO_S3=true the dump is also uploaded
// to the S3 bucket under backups/. Requires the PostgreSQL client tools (pg_dump) on PATH.
//
//   npm run db:backup
//   Restore: pg_restore --clean --no-owner -d "<connection url>" backups/<file>.dump
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('[backup] DIRECT_URL / DATABASE_URL is not set');
  process.exit(1);
}

const dir = path.join(__dirname, '..', 'backups');
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = path.join(dir, `derivion-${stamp}.dump`);
const keep = Math.max(1, parseInt(process.env.BACKUP_KEEP || '14', 10));

// pg_dump does not understand the pooler's pgbouncer flag
const cleanUrl = url.replace(/([?&])pgbouncer=true&?/, '$1').replace(/([?&])connection_limit=\d+&?/, '$1').replace(/[?&]$/, '');

const run = () => new Promise((resolve, reject) => {
  const child = spawn('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', `--file=${file}`, cleanUrl], { stdio: ['ignore', 'inherit', 'inherit'] });
  child.on('error', (err) => reject(err.code === 'ENOENT' ? new Error('pg_dump not found — install the PostgreSQL client tools') : err));
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`pg_dump exited with code ${code}`))));
});

(async () => {
  try {
    await run();
    const size = (fs.statSync(file).size / 1024 / 1024).toFixed(2);
    console.log(`[backup] wrote ${path.basename(file)} (${size} MB)`);

    if (process.env.BACKUP_TO_S3 === 'true') {
      const { uploadToS3, isAwsConfigured } = require('../src/config/aws');
      if (!isAwsConfigured()) throw new Error('BACKUP_TO_S3=true but AWS is not configured');
      const result = await uploadToS3(fs.readFileSync(file), `backups/${path.basename(file)}`, 'application/octet-stream');
      if (result.s3Key.startsWith('local://')) throw new Error('S3 upload failed (fell back to local storage)');
      console.log(`[backup] uploaded to s3://${process.env.AWS_S3_BUCKET}/${result.s3Key}`);
    }

    // Retention
    const dumps = fs.readdirSync(dir).filter((f) => f.endsWith('.dump')).sort().reverse();
    for (const old of dumps.slice(keep)) {
      fs.unlinkSync(path.join(dir, old));
      console.log(`[backup] removed old ${old}`);
    }
    process.exit(0);
  } catch (err) {
    console.error(`[backup] failed: ${err.message}`);
    if (fs.existsSync(file) && fs.statSync(file).size === 0) fs.unlinkSync(file);
    process.exit(1);
  }
})();
