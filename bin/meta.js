#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const packageJson = require('../package.json');
const { getBanner } = require('../lib/banner');

const program = new Command();

// Import command modules
const authCommands = require('../commands/auth');
const queryCommands = require('../commands/query');
const appCommands = require('../commands/app');
const limitsCommands = require('../commands/limits');
const postCommands = require('../commands/post');
const whatsappCommands = require('../commands/whatsapp');
const instagramCommands = require('../commands/instagram');
const utilsCommands = require('../commands/utils');
const agentCommands = require('../commands/agent');
const marketingCommands = require('../commands/marketing');

function showBanner() {
  const style = (process.env.META_CLI_BANNER_STYLE || 'slant').toLowerCase();
  const banner = getBanner(style);

  console.log(chalk.cyanBright(banner));
  console.log(chalk.yellow('For devs tired of token gymnastics'));
  console.log(chalk.green('Built by Chaos Craft Labs.'));
  console.log('');
}

const shouldShowBanner = process.argv.length <= 2 ||
  process.argv.includes('--help') ||
  process.argv.includes('-h');

if (shouldShowBanner && !process.argv.includes('--no-banner')) {
  showBanner();
}

program
  .name('meta')
  .description(chalk.gray('A CLI for Meta\'s APIs. For devs tired of token gymnastics.'))
  .version(packageJson.version);

// Register command groups
authCommands(program);
queryCommands(program);
appCommands(program);
limitsCommands(program);
postCommands(program);
whatsappCommands(program);
instagramCommands(program);
utilsCommands(program);
agentCommands(program);
marketingCommands(program);

// Custom help
program.on('--help', () => {
  console.log('');
  console.log(chalk.yellow('Examples:'));
  console.log('  $ meta auth login              ' + chalk.gray('# Authenticate with Meta'));
  console.log('  $ meta query me                ' + chalk.gray('# Get your profile info'));
  console.log('  $ meta app info                ' + chalk.gray('# View app configuration'));
  console.log('  $ meta limits check            ' + chalk.gray('# Check rate limits'));
  console.log('  $ meta post create --message "Hello" --page PAGE_ID  ' + chalk.gray('# Create a Page post'));
  console.log('  $ meta whatsapp send --from PHONE_ID --to +15551234567 --body "Hello"  ' + chalk.gray('# Send a WhatsApp message'));
  console.log('  $ meta instagram accounts list ' + chalk.gray('# List connected IG accounts'));
  console.log('  $ meta utils config show       ' + chalk.gray('# Show config + defaults'));
  console.log('  $ meta agent "fix whatsapp webhook for clientA"  ' + chalk.gray('# Plan first, then execute with confirmation'));
  console.log('  $ meta marketing accounts      ' + chalk.gray('# List ad accounts'));
  console.log('');
  console.log(chalk.cyan('Documentation: https://github.com/vishalgojha/meta-cli'));
});

program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
