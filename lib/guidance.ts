const chalk = require('chalk');
const { renderPanel, formatBadge } = require('./ui/chrome');
const { buildReadinessReport } = require('./readiness');
const { fetchHealth } = require('./gateway/manager');

function deriveGuidanceSteps(input = {}) {
  const readiness = input.readiness || buildReadinessReport();
  const health = input.health || { ok: false };

  const setupDone = Boolean(readiness.anyTokenConfigured && readiness.onboardingCompleted);
  const appDone = Boolean(readiness.appCredentialsConfigured);
  const gatewayDone = Boolean(health.ok);
  const verifyDone = Boolean(readiness.ok && health.ok);

  const steps = [
    {
      id: 'setup',
      title: 'Complete guided setup',
      command: 'social setup',
      done: setupDone,
      required: true,
      note: 'Connect tokens and finalize onboarding.'
    },
    {
      id: 'app',
      title: 'Configure app credentials',
      command: 'social auth app',
      done: appDone,
      required: false,
      note: 'Recommended for OAuth/debug flows.'
    },
    {
      id: 'start',
      title: 'Start gateway service',
      command: 'social start',
      done: gatewayDone,
      required: true,
      note: 'Runs API/WebSocket service.'
    },
    {
      id: 'verify',
      title: 'Verify runtime health',
      command: 'social status',
      done: verifyDone,
      required: true,
      note: 'Confirms readiness + live health.'
    },
    {
      id: 'operate',
      title: 'Operate from one command deck',
      command: 'social hatch',
      done: false,
      required: false,
      note: 'Launch terminal UI for daily operations.'
    }
  ];

  const nextRequired = steps.find((step) => step.required && !step.done);
  const nextAny = steps.find((step) => !step.done);
  const next = nextRequired || nextAny || null;

  return {
    readiness,
    health,
    steps,
    next
  };
}

async function buildGuidanceState(input = {}) {
  const host = String(input.host || '127.0.0.1').trim();
  const port = Number(input.port || 1310);
  const readiness = input.readiness || buildReadinessReport();
  const health = input.health || await fetchHealth(host, port);
  return {
    host,
    port,
    ...deriveGuidanceSteps({ readiness, health })
  };
}

function guidanceRows(state) {
  const rows = state.steps.map((step, index) => {
    const status = step.done
      ? formatBadge('DONE', { tone: 'success' })
      : (step.required ? formatBadge('NEXT', { tone: 'warn' }) : formatBadge('OPTIONAL', { tone: 'neutral' }));
    return `${index + 1}. ${status} ${chalk.cyan(step.title)}  ${chalk.gray(`(${step.command})`)}`;
  });

  if (state.next) {
    rows.push('');
    rows.push(`Now run: ${chalk.green(state.next.command)}`);
  }
  return rows;
}

function printGuidancePanel(state, options = {}) {
  const title = String(options.title || ' Guidance Sequence ');
  console.log('');
  console.log(renderPanel({
    title,
    rows: guidanceRows(state),
    minWidth: 88,
    borderColor: (value) => chalk.cyan(value)
  }));
  console.log('');
}

module.exports = {
  deriveGuidanceSteps,
  buildGuidanceState,
  guidanceRows,
  printGuidancePanel
};
