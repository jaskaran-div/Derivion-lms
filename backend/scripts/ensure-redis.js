// Dev helper (Windows + WSL): make sure the local Redis in WSL is up before the API starts.
// WSL stops its VM when no Windows process is attached, so we keep one detached `wsl` process
// alive. Elsewhere (Linux/macOS/servers) this is a no-op. The API falls back to an in-memory
// cache if Redis is unreachable, so failure here is only a warning.
require('dotenv').config();
const net = require('net');
const { spawn } = require('child_process');

const url = process.env.REDIS_URL;
if (!url || process.platform !== 'win32') process.exit(0);

const { hostname, port } = new URL(url);
if (!['127.0.0.1', 'localhost'].includes(hostname)) process.exit(0);

const canConnect = () =>
  new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port: Number(port) || 6379 });
    socket.setTimeout(1000);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
  });

(async () => {
  if (await canConnect()) {
    console.log('[redis] already running');
    return;
  }
  const distro = process.env.WSL_DISTRO || 'Ubuntu';
  const child = spawn(
    'wsl.exe',
    ['-d', distro, '-u', 'root', '--', 'bash', '-c', 'service redis-server start >/dev/null 2>&1; exec sleep infinity'],
    { detached: true, stdio: 'ignore', windowsHide: true }
  );
  child.unref();
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await canConnect()) {
      console.log('[redis] started in WSL');
      return;
    }
  }
  console.warn('[redis] could not start Redis in WSL; the API will use its in-memory cache');
})();
