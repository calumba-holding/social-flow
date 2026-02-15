const chalk = require('chalk');
const ora = require('ora');
const axios = require('axios');
const config = require('../lib/config');
const MetaAPIClient = require('../lib/api-client');

async function checkRateLimits(options) {
  const { api, json } = options;
  const token = config.getToken(api);

  if (!token) {
    console.error(chalk.red(`âœ– No ${api} token found. Run: meta auth login -a ${api}`));
    process.exit(1);
  }

  const spinner = ora('Checking rate limits...').start();
  const client = new MetaAPIClient(token, api);

  try {
    // Make a simple request to get headers
    const response = await axios.get(`${client.baseUrl}/me`, {
      params: { access_token: token, fields: 'id' },
      validateStatus: () => true // Don't throw on any status
    });

    spinner.stop();

    const headers = response.headers;

    // Meta returns rate limit info in headers
    const usage = headers['x-app-usage'] ? JSON.parse(headers['x-app-usage']) : null;
    const businessUsage = headers['x-business-use-case-usage']
      ? JSON.parse(headers['x-business-use-case-usage'])
      : null;

    if (json) {
      console.log(JSON.stringify({ usage, businessUsage }, null, 2));
      return;
    }

    console.log(chalk.bold('\nRate Limit Status:'));
    console.log(chalk.gray('â”€'.repeat(50)));

    if (usage) {
      console.log(chalk.bold('\nApp Usage:'));
      if (usage.call_count !== undefined) {
        const percentage = usage.call_count;
        const color = percentage > 75 ? chalk.red : percentage > 50 ? chalk.yellow : chalk.green;
        console.log(chalk.cyan('  Call Count:'), color(`${percentage}%`));
      }
      if (usage.total_time !== undefined) {
        const percentage = usage.total_time;
        const color = percentage > 75 ? chalk.red : percentage > 50 ? chalk.yellow : chalk.green;
        console.log(chalk.cyan('  Total Time:'), color(`${percentage}%`));
      }
      if (usage.total_cputime !== undefined) {
        const percentage = usage.total_cputime;
        const color = percentage > 75 ? chalk.red : percentage > 50 ? chalk.yellow : chalk.green;
        console.log(chalk.cyan('  Total CPU Time:'), color(`${percentage}%`));
      }
    } else {
      console.log(chalk.yellow('\nNo rate limit information available in response'));
      console.log(chalk.gray('(Rate limits are typically returned after making API calls)'));
    }

    if (businessUsage) {
      console.log(chalk.bold('\nBusiness Usage:'));
      Object.entries(businessUsage).forEach(([key, value]) => {
        console.log(chalk.cyan(`  ${key}:`));
        if (value.call_count !== undefined) {
          const percentage = value.call_count;
          const color = percentage > 75 ? chalk.red : percentage > 50 ? chalk.yellow : chalk.green;
          console.log(chalk.cyan('    Call Count:'), color(`${percentage}%`));
        }
        if (value.total_cputime !== undefined) {
          const percentage = value.total_cputime;
          const color = percentage > 75 ? chalk.red : percentage > 50 ? chalk.yellow : chalk.green;
          console.log(chalk.cyan('    CPU Time:'), color(`${percentage}%`));
        }
        if (value.total_time !== undefined) {
          const percentage = value.total_time;
          const color = percentage > 75 ? chalk.red : percentage > 50 ? chalk.yellow : chalk.green;
          console.log(chalk.cyan('    Total Time:'), color(`${percentage}%`));
        }
      });
    }

    console.log(chalk.bold('\nRate Limit Info:'));
    console.log(chalk.gray('  Meta uses a sliding window rate limit'));
    console.log(chalk.gray('  Limits reset gradually over time'));
    console.log(chalk.gray('  200 calls per hour per user (typical)'));
    console.log(chalk.gray('  App-level limits vary by app tier'));
    console.log('');

    if (usage && (usage.call_count > 75 || usage.total_time > 75 || usage.total_cputime > 75)) {
      console.log(chalk.red('âš ï¸  Warning: You\'re approaching rate limits!'));
      console.log(chalk.yellow('   Consider slowing down your requests'));
      console.log('');
    }
  } catch (error) {
    spinner.stop();
    console.error(chalk.red('âœ– Failed to check rate limits'));
    throw error;
  }
}

function showRateLimitDocs() {
  console.log(chalk.bold('\nMeta API Rate Limits:'));
  console.log(chalk.gray('â”€'.repeat(50)));
  console.log('\n' + chalk.cyan('User-level limits:'));
  console.log('  â€¢ 200 calls per hour per user (default)');
  console.log('  â€¢ Resets on a sliding window');
  console.log('\n' + chalk.cyan('App-level limits:'));
  console.log('  â€¢ Development: Limited');
  console.log('  â€¢ Standard: 200 calls/hour/user');
  console.log('  â€¢ Advanced: Higher limits (varies)');
  console.log('\n' + chalk.cyan('Business API limits:'));
  console.log('  â€¢ Varies by Business Manager tier');
  console.log('  â€¢ Measured in call count, CPU time, and total time');
  console.log('\n' + chalk.cyan('Headers returned:'));
  console.log('  â€¢ x-app-usage: App-level usage percentage');
  console.log('  â€¢ x-business-use-case-usage: Business usage');
  console.log('\n' + chalk.cyan('Tips:'));
  console.log('  â€¢ Implement exponential backoff for retries');
  console.log('  â€¢ Cache responses when possible');
  console.log('  â€¢ Use batch requests for multiple operations');
  console.log('  â€¢ Monitor usage with: meta limits check');
  console.log('\n' + chalk.gray('Documentation:'));
  console.log('  https://developers.facebook.com/docs/graph-api/overview/rate-limiting');
  console.log('');
}

function registerLimitsGroup(cmd) {
  cmd
    .command('check')
    .description('Check current rate limit status')
    .option('-a, --api <api>', 'API to use', config.getDefaultApi())
    .option('--json', 'Output as JSON')
    .action(checkRateLimits);

  cmd
    .command('checks')
    .description('Alias for "check"')
    .option('-a, --api <api>', 'API to use', config.getDefaultApi())
    .option('--json', 'Output as JSON')
    .action(checkRateLimits);

  cmd
    .command('docs')
    .description('Show rate limit documentation')
    .action(showRateLimitDocs);
}

function registerLimitsCommands(program) {
  const limits = program.command('limits').description('Check rate limits and usage');
  registerLimitsGroup(limits);

  const limit = program.command('limit').description('Alias for "limits"');
  registerLimitsGroup(limit);
}

module.exports = registerLimitsCommands;

