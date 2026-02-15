const chalk = require('chalk');
const ora = require('ora');
const axios = require('axios');
const config = require('../lib/config');
const MetaAPIClient = require('../lib/api-client');

function registerLimitsCommands(program) {
  const limits = program.command('limits').description('Check rate limits and usage');

  // Check rate limits
  limits
    .command('check')
    .description('Check current rate limit status')
    .option('-a, --api <api>', 'API to use', config.getDefaultApi())
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const { api, json } = options;
      const token = config.getToken(api);
      
      if (!token) {
        console.error(chalk.red(`✖ No ${api} token found. Run: meta auth login -a ${api}`));
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
        } else {
          console.log(chalk.bold('\nRate Limit Status:'));
          console.log(chalk.gray('─'.repeat(50)));
          
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
            console.log(chalk.red('⚠️  Warning: You\'re approaching rate limits!'));
            console.log(chalk.yellow('   Consider slowing down your requests'));
            console.log('');
          }
        }
      } catch (error) {
        spinner.stop();
        console.error(chalk.red('✖ Failed to check rate limits'));
        throw error;
      }
    });

  // Show rate limit documentation
  limits
    .command('docs')
    .description('Show rate limit documentation')
    .action(() => {
      console.log(chalk.bold('\nMeta API Rate Limits:'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log('\n' + chalk.cyan('User-level limits:'));
      console.log('  • 200 calls per hour per user (default)');
      console.log('  • Resets on a sliding window');
      console.log('\n' + chalk.cyan('App-level limits:'));
      console.log('  • Development: Limited');
      console.log('  • Standard: 200 calls/hour/user');
      console.log('  • Advanced: Higher limits (varies)');
      console.log('\n' + chalk.cyan('Business API limits:'));
      console.log('  • Varies by Business Manager tier');
      console.log('  • Measured in call count, CPU time, and total time');
      console.log('\n' + chalk.cyan('Headers returned:'));
      console.log('  • x-app-usage: App-level usage percentage');
      console.log('  • x-business-use-case-usage: Business usage');
      console.log('\n' + chalk.cyan('Tips:'));
      console.log('  • Implement exponential backoff for retries');
      console.log('  • Cache responses when possible');
      console.log('  • Use batch requests for multiple operations');
      console.log('  • Monitor usage with: meta limits check');
      console.log('\n' + chalk.gray('Documentation:'));
      console.log('  https://developers.facebook.com/docs/graph-api/overview/rate-limiting');
      console.log('');
    });
}

module.exports = registerLimitsCommands;
