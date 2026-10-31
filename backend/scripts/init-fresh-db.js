/**
 * Builds the LMS schema in a BRAND-NEW, EMPTY PostgreSQL database from the migration history.
 *
 *   DATABASE_URL=postgresql://... DIRECT_URL=postgresql://... node scripts/init-fresh-db.js
 *
 * Why this exists: prisma/migrations/0_init/migration.sql starts with a UTF-8 byte-order mark, which PostgreSQL rejects,
 * so `prisma migrate deploy` fails on an empty database. The production database was baselined long ago and is not
 * affected. We deliberately do NOT edit that file: Prisma records a checksum of every applied migration, and changing a
 * file that production already applied would make the repository disagree with production's history.
 *
 * What it does: strips the BOM from 0_init's SQL in memory, runs it, tells Prisma `0_init` is applied (the checksum
 * recorded is that of the file as it exists in Git), then lets `prisma migrate deploy` apply every later migration.
 * It refuses to touch a database that already contains tables.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { Client } = require('pg');

const root = path.join(__dirname, '..');
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL (and DIRECT_URL if you use a pooler) to the empty database to initialise.');
  process.exit(1);
}

const prisma = (args) => {
  const r = spawnSync(`npx prisma ${args.join(' ')}`, { cwd: root, env: process.env, encoding: 'utf8', shell: true });
  if (r.status !== 0) throw new Error(`prisma ${args.join(' ')} failed:\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
};

(async () => {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    if (rows.length) {
      throw new Error(`The database is not empty (${rows.length} tables, e.g. "${rows[0].table_name}"). Refusing to continue; this script is only for brand-new databases.`);
    }
    const dir = path.join(root, 'prisma', 'migrations', '0_init');
    const sql = fs.readFileSync(path.join(dir, 'migration.sql'), 'utf8').replace(/^﻿/, '');
    await client.query(sql);
    console.log('0_init applied (byte-order mark stripped in memory).');
  } finally {
    await client.end();
  }

  prisma(['migrate', 'resolve', '--applied', '0_init']);
  console.log('0_init recorded in _prisma_migrations.');
  console.log(prisma(['migrate', 'deploy']).split('\n').filter((l) => /applied|migration|up to date/i.test(l)).join('\n'));
  console.log('Done: the schema matches prisma/schema.prisma.');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
