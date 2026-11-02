// PM2 definition for the NEW LMS background worker only. It does not describe (or restart) your existing LMS web/frontend
// processes: keep managing those exactly as you do today.
//
//   pm2 start deploy/pm2/lms-worker.config.js      (from the LMS repo root; do this only when the guide says so)
//   pm2 save
//
// The worker reads backend/.env (dotenv). It delivers queued events to Operations, sends queued emails, and runs the
// housekeeping jobs. With the integration switched off (OPERATIONS_API_URL empty) it still runs but delivers nothing.
module.exports = {
  apps: [
    {
      name: 'lms-worker',
      cwd: `${__dirname}/../../backend`,
      script: 'src/workers/index.js',
      exec_mode: 'fork',
      instances: 1,               // one is enough; more would be safe (rows are claimed with FOR UPDATE SKIP LOCKED) but pointless
      max_memory_restart: '300M',
      kill_timeout: 8000,         // the worker finishes its current batch on SIGTERM
      min_uptime: '20s',
      max_restarts: 10,
      restart_delay: 3000,
      time: true,
      env: { NODE_ENV: 'production' },
    },
  ],
};
