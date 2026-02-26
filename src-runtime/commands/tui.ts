import path = require('path');
import fs = require('fs');
import { spawn } from 'child_process';
import chalk = require('chalk');
const inquirer = require('inquirer');

const config = require('../../lib/config');

type TuiOptions = {
  aiProvider?: string;
  aiModel?: string;
  aiBaseUrl?: string;
  aiApiKey?: string;
  skipOnboardCheck?: boolean;
};

function runSubprocess(command: string, args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      env
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`TUI exited with code ${code}`));
    });
  });
}

function needsOnboarding() {
  return !config.hasCompletedOnboarding();
}

function getConfiguredAgentApiKey() {
  const agent = typeof config.getAgentConfig === 'function' ? config.getAgentConfig() : {};
  return String(agent && agent.apiKey ? agent.apiKey : '').trim();
}

async function promptForApiKey(): Promise<string> {
  if (!process.stdout.isTTY || !process.stdin.isTTY) return '';

  console.log(chalk.yellow('\nHatch UI needs an OpenAI API key.'));
  console.log(chalk.gray('Enter it once now (input hidden). You can choose whether to save it.\n'));

  const answers = await inquirer.prompt([
    {
      type: 'password',
      name: 'key',
      mask: '*',
      message: 'Enter OpenAI API key:',
      validate: (value: string) => Boolean(String(value || '').trim()) || 'API key cannot be empty'
    },
    {
      type: 'confirm',
      name: 'save',
      default: true,
      message: 'Save this key to active profile for future hatch runs?'
    }
  ]);

  const key = String(answers.key || '').trim();
  if (key && answers.save && typeof config.setAgentApiKey === 'function') {
    config.setAgentProvider('openai');
    config.setAgentApiKey(key);
    console.log(chalk.green('Saved API key for active profile.\n'));
  }

  return key;
}

function registerTuiCommand(program: any) {
  program
    .command('tui')
    .alias('hatch')
    .description('Launch agentic terminal UI (chat-first control plane)')
    .option('--ai-provider <provider>', 'openai', 'openai')
    .option('--ai-model <model>', 'AI model override')
    .option('--ai-base-url <url>', 'AI base URL override')
    .option('--ai-api-key <key>', 'AI API key override')
    .option('--skip-onboard-check', 'Skip onboarding guard and open hatch directly', false)
    .action(async (opts: TuiOptions) => {
      const rootDir = path.join(__dirname, '..', '..', '..');
      const distEntry = path.join(rootDir, 'tools', 'agentic-tui', 'dist', 'index.js');
      const srcEntry = path.join(rootDir, 'tools', 'agentic-tui', 'src', 'index.tsx');
      const binPath = path.join(rootDir, 'dist-legacy', 'bin', 'social.js');
      const provider = String(opts.aiProvider || process.env.SOCIAL_TUI_AI_PROVIDER || 'openai').trim().toLowerCase();
      if (provider !== 'openai') {
        console.error(chalk.red('\nOnly provider "openai" is supported for Hatch UI.\n'));
        process.exit(1);
      }

      const apiKey = String(
        opts.aiApiKey ||
          process.env.SOCIAL_TUI_AI_API_KEY ||
          process.env.OPENAI_API_KEY ||
          getConfiguredAgentApiKey() ||
          ''
      ).trim();

      let resolvedApiKey = apiKey;
      if (!resolvedApiKey) {
        resolvedApiKey = await promptForApiKey();
      }

      if (!resolvedApiKey) {
        console.error(chalk.red('\nHatch UI requires a valid API key.'));
        console.error(chalk.gray('Set OPENAI_API_KEY, pass --ai-api-key, or run `social hatch` in a terminal to enter it securely.\n'));
        process.exit(1);
      }

      const env: NodeJS.ProcessEnv = {
        ...process.env,
        SOCIAL_TUI_AI_PROVIDER: provider,
        SOCIAL_TUI_AI_MODEL: opts.aiModel || process.env.SOCIAL_TUI_AI_MODEL || '',
        SOCIAL_TUI_AI_BASE_URL: opts.aiBaseUrl || process.env.SOCIAL_TUI_AI_BASE_URL || '',
        SOCIAL_TUI_AI_API_KEY: resolvedApiKey
      };

      try {
        if (!opts.skipOnboardCheck && needsOnboarding()) {
          console.log(chalk.yellow('\nFirst-run setup required before Hatch UI.'));
          console.log(chalk.gray('Guided path: setup -> status -> hatch.\n'));
          await runSubprocess(process.execPath, [binPath, '--no-banner', 'setup', '--no-start'], env);
          return;
        }

        if (fs.existsSync(distEntry)) {
          await runSubprocess(process.execPath, [distEntry], env);
          return;
        }

        const tsxCli = require.resolve('tsx/dist/cli.mjs');
        await runSubprocess(process.execPath, [tsxCli, srcEntry], env);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`x Failed to start TUI: ${message}`));
        console.error(chalk.yellow('Build hint: npm run build:social-ts && npm --prefix tools/agentic-tui run build'));
        process.exit(1);
      }
    });
}

export = registerTuiCommand;
