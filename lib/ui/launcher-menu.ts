const path = require('path');
const { spawn } = require('child_process');
const inquirer = require('inquirer');
const chalk = require('chalk');
const config = require('../config');
const { renderPanel, formatBadge, kv } = require('./chrome');

function isOnboarded() {
  return config.hasCompletedOnboarding();
}

function tokenBadge(label, ok) {
  const state = ok ? formatBadge('READY', { tone: 'success' }) : formatBadge('MISSING', { tone: 'warn' });
  return `${chalk.cyan(label.padEnd(10, ' '))} ${state}`;
}

function printFrame(onboarded) {
  const fb = config.hasToken('facebook');
  const ig = config.hasToken('instagram');
  const wa = config.hasToken('whatsapp');
  const status = onboarded ? formatBadge('ONBOARDED', { tone: 'success' }) : formatBadge('SETUP REQUIRED', { tone: 'warn' });
  const profile = config.getActiveProfile();
  const defaultApi = config.getDefaultApi();

  const rows = [
    kv('Profile', chalk.cyan(profile), { labelWidth: 12 }),
    kv('Default API', chalk.cyan(defaultApi), { labelWidth: 12 }),
    kv('Status', status, { labelWidth: 12 }),
    '',
    tokenBadge('facebook', fb),
    tokenBadge('instagram', ig),
    tokenBadge('whatsapp', wa),
    '',
    chalk.gray('Hotkeys'),
    '  [o] Onboard   [h] Hatch UI   [s] Start   [t] Status   [g] Guide   [d] Doctor   [?] Help   [q] Exit',
    `  [enter] ${onboarded ? 'Open hatch UI' : 'Run onboarding'}`
  ];

  console.log('');
  console.log(renderPanel({
    title: ' Social Flow Launcher ',
    rows,
    minWidth: 76,
    borderColor: (value) => chalk.cyan(value)
  }));
}

function printHelpCommands() {
  console.log('');
  console.log(renderPanel({
    title: ' Launcher Help ',
    rows: [
      chalk.gray('social onboard'),
      chalk.gray('social doctor'),
      chalk.gray('social auth login -a facebook'),
      chalk.gray('social tui             # hatch UI (terminal chat)'),
      chalk.gray('social start           # managed gateway start'),
      chalk.gray('social status          # runtime + readiness status'),
      chalk.gray('social logs            # recent gateway logs'),
      chalk.gray('social guide           # universal guidance sequence'),
      chalk.gray('social gateway         # foreground API + websocket mode'),
      chalk.gray('social --help')
    ],
    minWidth: 76,
    borderColor: (value) => chalk.blue(value)
  }));
  console.log('');
}

function runCommand(binPath, args) {
  return new Promise((resolve, reject) => {
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

async function startLauncherMenu(binPath) {
  console.log(chalk.cyan('\nSocial Flow Interactive Menu'));
  console.log(chalk.gray('Launch onboarding, diagnostics, or hatch UI from one command deck.\n'));
  if (!isOnboarded()) {
    console.log(chalk.yellow('First run detected: start with [o] Onboard.\n'));
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const onboarded = isOnboarded();
    printFrame(onboarded);

    // eslint-disable-next-line no-await-in-loop
    const answer = await inquirer.prompt([
      {
        type: 'input',
        name: 'choice',
        message: 'Select action key',
        default: onboarded ? 'h' : 'o',
        filter: (value) => String(value || '').trim().toLowerCase(),
        validate: (value) => {
          const key = String(value || '').trim().toLowerCase();
          if (['o', 'h', 's', 't', 'g', 'd', 'q', '?'].includes(key)) return true;
          return 'Use one key: o/h/s/t/g/d/q/?';
        }
      }
    ]);

    const key = answer.choice || (onboarded ? 'h' : 'o');
    if (key === 'q') return;
    if (key === '?') {
      printHelpCommands();
      continue;
    }
    if (!onboarded && ['h', 'd', 't', 'g'].includes(key)) {
      console.log(chalk.yellow('\nRun onboarding first (press o).\n'));
      continue;
    }

    try {
      if (key === 'o') {
        // eslint-disable-next-line no-await-in-loop
        await runCommand(binPath, ['onboard']);
      } else if (key === 'd') {
        // eslint-disable-next-line no-await-in-loop
        await runCommand(binPath, ['doctor']);
      } else if (key === 's') {
        // eslint-disable-next-line no-await-in-loop
        await runCommand(binPath, ['start']);
      } else if (key === 't') {
        // eslint-disable-next-line no-await-in-loop
        await runCommand(binPath, ['status']);
      } else if (key === 'g') {
        // eslint-disable-next-line no-await-in-loop
        await runCommand(binPath, ['guide']);
      } else if (key === 'h') {
        // eslint-disable-next-line no-await-in-loop
        await runCommand(binPath, ['tui']);
      }
    } catch (err) {
      console.log(chalk.red(`\n${String((err && err.message) || err)}\n`));
    }
  }
}

module.exports = {
  startLauncherMenu
};
