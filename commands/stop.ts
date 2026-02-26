const chalk = require('chalk');
const { stopGatewayBackground } = require('../lib/gateway/manager');

function registerStopCommand(program) {
  program
    .command('stop')
    .description('Stop the background API gateway service')
    .option('--keep-state', 'Keep saved gateway runtime metadata after stopping', false)
    .action(async (opts) => {
      const result = await stopGatewayBackground({
        clearState: !Boolean(opts.keepState)
      });

      if (result.alreadyStopped) {
        console.log(chalk.yellow('Gateway is not running.\n'));
        return;
      }
      if (result.stopped) {
        console.log(chalk.green('Gateway stopped.\n'));
      } else {
        console.log(chalk.red('Gateway stop requested but process may still be running.\n'));
        process.exit(1);
      }
    });
}

module.exports = registerStopCommand;
