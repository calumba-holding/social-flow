#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const distCli = path.join(__dirname, '..', 'dist-legacy', 'bin', 'social.js');

if (fs.existsSync(distCli)) {
  require(distCli); // eslint-disable-line global-require
  return;
}

const sourceCli = path.join(__dirname, 'social.ts');
if (fs.existsSync(sourceCli)) {
  try {
    // eslint-disable-next-line global-require
    const tsxCli = require.resolve('tsx/dist/cli.mjs');
    const result = spawnSync(process.execPath, [tsxCli, sourceCli, ...process.argv.slice(2)], {
      stdio: 'inherit',
      env: process.env
    });
    process.exit(result.status || 0);
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.error(`Unable to run source fallback with tsx: ${message}`);
  }
}

// eslint-disable-next-line no-console
console.error('Missing dist-legacy CLI build. Run `npm run build:legacy-ts` or `npm install`.');
process.exit(1);
