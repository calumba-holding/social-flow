const path = require('path');
const { spawn } = require('child_process');

type FacebookMeOptions = {
  fields?: string;
  json?: boolean;
  verbose?: boolean;
};

type FacebookPagesOptions = {
  limit?: string;
  json?: boolean;
  table?: boolean;
  setDefault?: boolean;
};

type FacebookFeedOptions = {
  pageId: string;
  limit?: string;
  json?: boolean;
  table?: boolean;
};

type FacebookPostOptions = {
  message: string;
  page?: string;
  link?: string;
  draft?: boolean;
  schedule?: string;
  json?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
};

function runSocial(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const binPath = path.join(__dirname, '..', 'bin', 'social.js');
    const child = spawn(process.execPath, [binPath, '--no-banner', ...args], {
      stdio: 'inherit',
      env: process.env
    });
    child.on('error', reject);
    child.on('close', (code: number | null) => {
      if (code === 0) resolve();
      else reject(new Error(`social ${args.join(' ')} exited with code ${code}`));
    });
  });
}

function registerFacebookCommand(program: any) {
  const facebook = program.command('facebook').description('Facebook-first shortcuts for common tasks');

  facebook
    .command('login')
    .description('Login with Facebook token flow')
    .action(async () => {
      await runSocial(['auth', 'login', '--api', 'facebook']);
    });

  facebook
    .command('me')
    .description('Get your Facebook profile information')
    .option('-f, --fields <fields>', 'Fields to retrieve', 'id,name')
    .option('--json', 'Output as JSON')
    .option('--verbose', 'Log request details (no secrets)')
    .action(async (options: FacebookMeOptions) => {
      const args = ['query', 'me', '--api', 'facebook', '--fields', options.fields || 'id,name'];
      if (options.json) args.push('--json');
      if (options.verbose) args.push('--verbose');
      await runSocial(args);
    });

  facebook
    .command('pages')
    .description('List Facebook Pages (and optionally set default Page)')
    .option('-l, --limit <n>', 'Limit', '25')
    .option('--json', 'Output as JSON')
    .option('--table', 'Output as table')
    .option('--set-default', 'Interactively pick and save a default Facebook Page')
    .action(async (options: FacebookPagesOptions) => {
      if (options.setDefault) {
        const args = ['post', 'pages', '--set-default'];
        if (options.json) args.push('--json');
        await runSocial(args);
        return;
      }

      const args = ['query', 'pages', '--limit', options.limit || '25'];
      if (options.json) args.push('--json');
      if (options.table) args.push('--table');
      await runSocial(args);
    });

  facebook
    .command('feed')
    .description('List recent posts for a Facebook Page')
    .requiredOption('--page-id <id>', 'Facebook Page ID')
    .option('-l, --limit <n>', 'Limit', '10')
    .option('--json', 'Output as JSON')
    .option('--table', 'Output as table')
    .action(async (options: FacebookFeedOptions) => {
      const args = ['query', 'feed', '--page-id', options.pageId, '--limit', options.limit || '10'];
      if (options.json) args.push('--json');
      if (options.table) args.push('--table');
      await runSocial(args);
    });

  facebook
    .command('post')
    .description('Create a Facebook Page post')
    .requiredOption('-m, --message <message>', 'Post message text')
    .option('-p, --page <pageId>', 'Facebook Page ID (defaults to configured)')
    .option('-l, --link <url>', 'Link to attach')
    .option('--draft', 'Create unpublished draft (published=false)')
    .option('--schedule <time>', 'Schedule publish time (unix seconds or ISO date)')
    .option('--json', 'Output as JSON')
    .option('--dry-run', 'Print request details without API call')
    .option('--verbose', 'Print request details')
    .action(async (options: FacebookPostOptions) => {
      const args = ['post', 'create', '--message', options.message];
      if (options.page) args.push('--page', options.page);
      if (options.link) args.push('--link', options.link);
      if (options.draft) args.push('--draft');
      if (options.schedule) args.push('--schedule', options.schedule);
      if (options.json) args.push('--json');
      if (options.dryRun) args.push('--dry-run');
      if (options.verbose) args.push('--verbose');
      await runSocial(args);
    });

  facebook.action(() => {
    facebook.outputHelp();
  });
}

module.exports = registerFacebookCommand;
