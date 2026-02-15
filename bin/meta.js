#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const packageJson = require('../package.json');

const program = new Command();

// Import command modules
const authCommands = require('../commands/auth');
const queryCommands = require('../commands/query');
const appCommands = require('../commands/app');
const limitsCommands = require('../commands/limits');

program
  .name('meta')
  .description(chalk.gray('A CLI for Meta\'s APIs. For devs tired of token gymnastics.'))
  .version(packageJson.version);

// Register command groups
authCommands(program);
queryCommands(program);
appCommands(program);
limitsCommands(program);

// Custom help
program.on('--help', () => {
  console.log('');
  console.log(chalk.yellow('Examples:'));
  console.log('  $ meta auth login              ' + chalk.gray('# Authenticate with Meta'));
  console.log('  $ meta query me                ' + chalk.gray('# Get your profile info'));
  console.log('  $ meta app info                ' + chalk.gray('# View app configuration'));
  console.log('  $ meta limits check            ' + chalk.gray('# Check rate limits'));
  console.log('');
  console.log(chalk.cyan('Documentation: https://github.com/yourusername/meta-cli'));
});

program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
