const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const config = require('../config');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function safeUnlink(filePath) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // Ignore cleanup errors.
  }
}

function getRuntimePaths() {
  const runtimeDir = resolveRuntimeDir();
  return {
    runtimeDir,
    pidFile: path.join(runtimeDir, 'gateway.pid'),
    stateFile: path.join(runtimeDir, 'gateway.json'),
    logFile: path.join(runtimeDir, 'gateway.log')
  };
}

function canWriteDir(dirPath) {
  try {
    ensureDir(dirPath);
    const probe = path.join(dirPath, '.write-test');
    fs.writeFileSync(probe, 'ok', 'utf8');
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

function resolveRuntimeDir() {
  const preferredBase = path.dirname(config.getConfigPath());
  const candidates = [
    path.join(preferredBase, 'runtime'),
    path.join(process.cwd(), '.social-runtime'),
    path.join(os.tmpdir(), 'social-cli-runtime')
  ];
  for (const dir of candidates) {
    if (canWriteDir(dir)) return dir;
  }
  return path.join(preferredBase, 'runtime');
}

function isProcessRunning(pid) {
  const target = Number(pid || 0);
  if (!Number.isInteger(target) || target <= 0) return false;
  try {
    process.kill(target, 0);
    return true;
  } catch (error) {
    const code = error && error.code ? String(error.code) : '';
    // On some systems EPERM means process exists but signal is not permitted.
    if (code === 'EPERM') return true;
    return false;
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchHealth(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get(
      {
        host,
        port,
        path: '/api/health',
        timeout: timeoutMs
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          let data = {};
          try {
            const raw = Buffer.concat(chunks).toString('utf8');
            data = raw ? JSON.parse(raw) : {};
          } catch {
            data = {};
          }
          resolve({
            ok: res.statusCode === 200 && Boolean(data.ok),
            status: res.statusCode || 0,
            data
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, status: 0, data: {} });
    });
    req.on('error', () => resolve({ ok: false, status: 0, data: {} }));
  });
}

async function waitForHealthy(options = {}) {
  const host = String(options.host || '127.0.0.1').trim();
  const port = Number(options.port || 1310);
  const timeoutMs = Math.max(500, Number(options.timeoutMs || 12000));
  const startedAt = Date.now();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const health = await fetchHealth(host, port, 1200);
    if (health.ok) return health;
    if (Date.now() - startedAt >= timeoutMs) return health;
    // eslint-disable-next-line no-await-in-loop
    await wait(350);
  }
}

function readPid(paths) {
  if (!fs.existsSync(paths.pidFile)) return 0;
  const raw = String(fs.readFileSync(paths.pidFile, 'utf8') || '').trim();
  const pid = Number(raw);
  return Number.isInteger(pid) && pid > 0 ? pid : 0;
}

function writePid(paths, pid) {
  ensureDir(paths.runtimeDir);
  fs.writeFileSync(paths.pidFile, String(pid), 'utf8');
}

function buildGatewayArgs(options = {}) {
  const host = String(options.host || '127.0.0.1').trim();
  const port = String(options.port || '1310').trim();
  const apiKey = String(options.apiKey || '').trim();
  const corsOrigins = String(options.corsOrigins || '').trim();
  const rateLimitMax = String(options.rateLimitMax || '180').trim();
  const rateLimitWindowMs = String(options.rateLimitWindowMs || '60000').trim();
  const args = ['--no-banner', 'gateway', '--host', host, '--port', port, '--rate-limit-max', rateLimitMax, '--rate-limit-window-ms', rateLimitWindowMs];

  if (apiKey) args.push('--api-key', apiKey);
  if (options.requireApiKey) args.push('--require-api-key');
  if (corsOrigins) args.push('--cors-origins', corsOrigins);
  if (options.debug) args.push('--debug');
  return { host, port: Number(port), args };
}

function getGatewayStatus() {
  const paths = getRuntimePaths();
  ensureDir(paths.runtimeDir);
  const pid = readPid(paths);
  const state = readJson(paths.stateFile) || {};
  const running = isProcessRunning(pid);
  return {
    running,
    pid,
    host: String(state.host || '127.0.0.1'),
    port: Number(state.port || 1310),
    startedAt: String(state.startedAt || ''),
    paths
  };
}

async function startGatewayBackground(options = {}) {
  const { host, port, args } = buildGatewayArgs(options);
  const status = getGatewayStatus();
  const existingHealth = await fetchHealth(host, port);

  if (existingHealth.ok) {
    return {
      started: false,
      external: true,
      status: {
        ...status,
        host,
        port
      },
      health: existingHealth
    };
  }

  if (status.running) {
    const health = await fetchHealth(status.host, status.port);
    return {
      started: false,
      external: false,
      status,
      health
    };
  }

  const paths = getRuntimePaths();
  ensureDir(paths.runtimeDir);

  const binPath = path.join(__dirname, '..', '..', 'bin', 'social.js');
  const commandArgs = [binPath, ...args];
  const outFd = fs.openSync(paths.logFile, 'a');

  const child = spawn(process.execPath, commandArgs, {
    detached: true,
    stdio: ['ignore', outFd, outFd],
    env: process.env,
    windowsHide: true
  });
  child.unref();
  fs.closeSync(outFd);

  writePid(paths, child.pid);
  writeJsonAtomic(paths.stateFile, {
    host,
    port,
    startedAt: new Date().toISOString(),
    args
  });

  const health = await waitForHealthy({ host, port, timeoutMs: options.healthTimeoutMs || 12000 });
  return {
    started: true,
    external: false,
    status: getGatewayStatus(),
    health
  };
}

async function stopGatewayBackground(options = {}) {
  const status = getGatewayStatus();
  const paths = status.paths;
  if (!status.pid || !status.running) {
    safeUnlink(paths.pidFile);
    return {
      stopped: false,
      alreadyStopped: true,
      status: getGatewayStatus()
    };
  }

  try {
    process.kill(status.pid, 'SIGTERM');
  } catch {
    // If we cannot signal, proceed to cleanup checks.
  }

  const timeoutMs = Math.max(500, Number(options.timeoutMs || 5000));
  const startedAt = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (!isProcessRunning(status.pid)) break;
    if (Date.now() - startedAt >= timeoutMs) break;
    // eslint-disable-next-line no-await-in-loop
    await wait(180);
  }

  if (isProcessRunning(status.pid)) {
    try {
      process.kill(status.pid, 'SIGKILL');
    } catch {
      // Best effort hard stop.
    }
  }

  safeUnlink(paths.pidFile);
  if (options.clearState) safeUnlink(paths.stateFile);

  return {
    stopped: !isProcessRunning(status.pid),
    alreadyStopped: false,
    status: getGatewayStatus()
  };
}

function tailLines(text, limit = 120) {
  const n = Math.max(1, Number(limit || 120));
  return String(text || '')
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .slice(-n)
    .join('\n');
}

function readGatewayLogs(options = {}) {
  const paths = getRuntimePaths();
  if (!fs.existsSync(paths.logFile)) return '';
  const raw = fs.readFileSync(paths.logFile, 'utf8');
  return tailLines(raw, Number(options.lines || 120));
}

module.exports = {
  fetchHealth,
  getGatewayStatus,
  startGatewayBackground,
  stopGatewayBackground,
  readGatewayLogs,
  tailLines
};
