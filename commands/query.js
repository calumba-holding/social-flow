const chalk = require('chalk');
const ora = require('ora');
const config = require('../lib/config');
const MetaAPIClient = require('../lib/api-client');
const { formatJson, formatTable } = require('../lib/formatters');

function registerQueryCommands(program) {
  const query = program.command('query').description('Query Meta APIs');

  // Get current user info
  query
    .command('me')
    .description('Get your profile information')
    .option('-a, --api <api>', 'API to use', config.getDefaultApi())
    .option('-f, --fields <fields>', 'Fields to retrieve (comma-separated)', 'id,name,email')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const { api, fields, json } = options;
      const token = config.getToken(api);
      
      if (!token) {
        console.error(chalk.red(`✖ No ${api} token found. Run: meta auth login -a ${api}`));
        process.exit(1);
      }

      const spinner = ora('Fetching profile...').start();
      const client = new MetaAPIClient(token, api);
      const data = await client.getMe(fields);
      spinner.stop();

      if (json) {
        console.log(JSON.stringify(data, null, 2));
      } else {
        console.log(chalk.bold('\nProfile Information:'));
        console.log(chalk.gray('─'.repeat(50)));
        Object.entries(data).forEach(([key, value]) => {
          console.log(chalk.cyan(`${key}:`), value);
        });
        console.log('');
      }
    });

  // Facebook pages
  query
    .command('pages')
    .description('Get your Facebook pages')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const { json } = options;
      const token = config.getToken('facebook');
      
      if (!token) {
        console.error(chalk.red('✖ No Facebook token found. Run: meta auth login -a facebook'));
        process.exit(1);
      }

      const spinner = ora('Fetching pages...').start();
      const client = new MetaAPIClient(token, 'facebook');
      const result = await client.getFacebookPages();
      spinner.stop();

      if (json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(chalk.bold('\nYour Facebook Pages:'));
        console.log(chalk.gray('─'.repeat(50)));
        
        if (result.data && result.data.length > 0) {
          result.data.forEach((page, i) => {
            console.log(chalk.bold(`\n${i + 1}. ${page.name}`));
            console.log(chalk.cyan('   ID:'), page.id);
            console.log(chalk.cyan('   Category:'), page.category);
            if (page.fan_count !== undefined) {
              console.log(chalk.cyan('   Fans:'), page.fan_count.toLocaleString());
            }
          });
        } else {
          console.log(chalk.yellow('No pages found'));
        }
        console.log('');
      }
    });

  // Instagram media
  query
    .command('instagram-media')
    .description('Get Instagram media')
    .option('-u, --user <userId>', 'Instagram user ID')
    .option('-l, --limit <limit>', 'Number of items to retrieve', '10')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const { user, limit, json } = options;
      const token = config.getToken('instagram');
      
      if (!token) {
        console.error(chalk.red('✖ No Instagram token found. Run: meta auth login -a instagram'));
        process.exit(1);
      }

      const client = new MetaAPIClient(token, 'instagram');
      
      let userId = user;
      if (!userId) {
        const spinner = ora('Getting Instagram account...').start();
        const account = await client.getInstagramAccount();
        userId = account.id;
        spinner.text = 'Fetching media...';
      }

      const spinner = ora('Fetching media...').start();
      const result = await client.getInstagramMedia(userId, parseInt(limit));
      spinner.stop();

      if (json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(chalk.bold('\nInstagram Media:'));
        console.log(chalk.gray('─'.repeat(50)));
        
        if (result.data && result.data.length > 0) {
          result.data.forEach((media, i) => {
            console.log(chalk.bold(`\n${i + 1}. ${media.media_type}`));
            console.log(chalk.cyan('   ID:'), media.id);
            if (media.caption) {
              const caption = media.caption.length > 60 
                ? media.caption.substring(0, 60) + '...' 
                : media.caption;
              console.log(chalk.cyan('   Caption:'), caption);
            }
            console.log(chalk.cyan('   URL:'), media.permalink);
            console.log(chalk.cyan('   Posted:'), new Date(media.timestamp).toLocaleDateString());
          });
        } else {
          console.log(chalk.yellow('No media found'));
        }
        console.log('');
      }
    });

  // Custom query
  query
    .command('custom <endpoint>')
    .description('Make a custom API request')
    .option('-a, --api <api>', 'API to use', config.getDefaultApi())
    .option('-f, --fields <fields>', 'Fields to retrieve')
    .option('-p, --params <params>', 'Additional params as JSON string')
    .option('--json', 'Output as JSON (default)')
    .action(async (endpoint, options) => {
      const { api, fields, params: paramsStr, json = true } = options;
      const token = config.getToken(api);
      
      if (!token) {
        console.error(chalk.red(`✖ No ${api} token found. Run: meta auth login -a ${api}`));
        process.exit(1);
      }

      // Parse params
      let params = {};
      if (fields) {
        params.fields = fields;
      }
      if (paramsStr) {
        try {
          params = { ...params, ...JSON.parse(paramsStr) };
        } catch (e) {
          console.error(chalk.red('✖ Invalid JSON in params'));
          process.exit(1);
        }
      }

      const spinner = ora(`Querying ${endpoint}...`).start();
      const client = new MetaAPIClient(token, api);
      const data = await client.customQuery(endpoint, params);
      spinner.stop();

      if (json) {
        console.log(JSON.stringify(data, null, 2));
      } else {
        console.log(data);
      }
    });
}

module.exports = registerQueryCommands;
