const chalk = require('chalk');
const { createGatewayServer } = require('../lib/gateway/server');
const { openUrl } = require('../lib/open-url');

function registerStudioCommand(program) {
  program
    .command('studio')
    .description('Launch Social Studio web app (gateway + UI)')
    .option('--host <host>', 'Host address', '127.0.0.1')
    .option('--port <port>', 'Port number', '1310')
    .option('--api-key <key>', 'Gateway API key for protected access (header: x-gateway-key)')
    .option('--require-api-key', 'Require API key even for localhost requests', false)
    .option('--cors-origins <csv>', 'Comma-separated allowed CORS origins')
    .option('--rate-limit-max <n>', 'Max API requests per window', '180')
    .option('--rate-limit-window-ms <ms>', 'Rate limit window in milliseconds', '60000')
    .option('--open', 'Open browser automatically', true)
    .option('--no-open', 'Do not open browser automatically')
    .option('--debug', 'Enable debug mode for gateway chat processing', false)
    .action(async (opts) => {
      const server = createGatewayServer({
        host: opts.host,
        port: parseInt(opts.port, 10),
        debug: Boolean(opts.debug),
        apiKey: opts.apiKey,
        requireApiKey: Boolean(opts.requireApiKey),
        corsOrigins: opts.corsOrigins,
        rateLimitMax: parseInt(opts.rateLimitMax, 10),
        rateLimitWindowMs: parseInt(opts.rateLimitWindowMs, 10)
      });
      await server.start();

      const url = server.url();
      console.log(chalk.green('\nSocial Studio is running.'));
      console.log(chalk.cyan(`UI: ${url}`));
      console.log(chalk.gray('Press Ctrl+C to stop.\n'));

      if (opts.open) {
        await openUrl(url);
      }

      const shutdown = async () => {
        await server.stop();
        process.exit(0);
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    });
}

module.exports = registerStudioCommand;
