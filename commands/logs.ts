const chalk = require('chalk');
const { readGatewayLogs, getGatewayStatus, fetchHealth } = require('../lib/gateway/manager');

function registerLogsCommand(program) {
  program
    .command('logs')
    .description('Show recent gateway logs from background service')
    .option('--lines <n>', 'Number of lines to show', '120')
    .action(async (opts) => {
      const lines = Math.max(1, Number(opts.lines || 120));
      const status = getGatewayStatus();
      const text = readGatewayLogs({ lines });
      if (!text) {
        const health = await fetchHealth(status.host, status.port);
        console.log(chalk.yellow('No gateway logs found yet.'));
        if (health.ok && !status.running) {
          console.log(chalk.gray('Gateway appears to be running as an external process (unmanaged).'));
        } else if (!status.running) {
          console.log(chalk.gray('Start gateway first: social start'));
        }
        console.log('');
        return;
      }

      console.log(chalk.gray(`\nGateway logs (last ${lines} lines):\n`));
      console.log(text);
      console.log('');
    });
}

module.exports = registerLogsCommand;
