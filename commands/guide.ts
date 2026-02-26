const path = require('path');
const { spawn } = require('child_process');
const { buildGuidanceState, printGuidancePanel } = require('../lib/guidance');

function runSubprocess(args) {
  return new Promise((resolve, reject) => {
    const binPath = path.join(__dirname, '..', 'bin', 'social.js');
    const child = spawn(process.execPath, [binPath, '--no-banner', ...args], {
      stdio: 'inherit',
      env: process.env
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`social ${args.join(' ')} exited with code ${code}`));
    });
  });
}

function registerGuideCommand(program) {
  program
    .command('guide')
    .description('Show the universal guidance sequence (same flow for every user)')
    .option('--host <host>', 'Gateway host for health checks', '127.0.0.1')
    .option('--port <port>', 'Gateway port for health checks', '1310')
    .option('--json', 'Output guidance as JSON')
    .option('--run-next', 'Run the recommended next command automatically', false)
    .action(async (opts) => {
      const state = await buildGuidanceState({
        host: opts.host,
        port: opts.port
      });

      if (opts.json) {
        console.log(JSON.stringify(state, null, 2));
        return;
      }

      printGuidancePanel(state);

      if (opts.runNext && state.next && state.next.command) {
        const parts = String(state.next.command).trim().split(/\s+/).slice(1);
        if (parts.length) {
          await runSubprocess(parts);
        }
      }
    });
}

module.exports = registerGuideCommand;
