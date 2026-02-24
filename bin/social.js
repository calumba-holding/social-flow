#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const distCli = path.join(__dirname, '..', 'dist-legacy', 'bin', 'social.js');

if (!fs.existsSync(distCli)) {
  // eslint-disable-next-line no-console
  console.error('Missing dist-legacy CLI build. Run `npm run build:legacy-ts` first.');
  process.exit(1);
}

require(distCli); // eslint-disable-line global-require
