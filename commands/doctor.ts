const chalk = require('chalk');
const config = require('../lib/config');
const { t } = require('../lib/i18n');
const { renderPanel, formatBadge, kv } = require('../lib/ui/chrome');

function firstConfiguredApi(tokens = {}) {
  const apis = ['facebook', 'instagram', 'whatsapp'];
  for (const api of apis) {
    if (tokens[api]) return api;
  }
  return '';
}

function buildSnapshot(options = {}) {
  const autoFix = options.autoFix !== false;
  const activeProfile = config.getActiveProfile();
  const profiles = config.listProfiles();

  const apiVersion = config.getApiVersion();
  let defaultApi = config.getDefaultApi();

  const tokens = {
    facebook: config.hasToken('facebook'),
    instagram: config.hasToken('instagram'),
    whatsapp: config.hasToken('whatsapp')
  };
  const autoFixes = [];

  // Inline auto-fix: if default API has no token but another API is configured, switch default.
  if (defaultApi && !tokens[defaultApi] && autoFix) {
    const fallbackApi = firstConfiguredApi(tokens);
    if (fallbackApi) {
      config.setDefaultApi(fallbackApi);
      defaultApi = fallbackApi;
      autoFixes.push(`Default API auto-switched to "${fallbackApi}" (the previous default token was missing).`);
    }
  }

  const appCredentialsConfigured = config.hasAppCredentials();

  const defaults = {
    facebookPageId: config.getDefaultFacebookPageId(),
    igUserId: config.getDefaultIgUserId(),
    whatsappPhoneNumberId: config.getDefaultWhatsAppPhoneNumberId(),
    marketingAdAccountId: config.getDefaultMarketingAdAccountId()
  };

  const blockers = [];
  const advisories = [];

  if (!tokens.facebook && !tokens.instagram && !tokens.whatsapp) {
    blockers.push(t('doctor_no_tokens'));
  } else {
    if (!tokens.facebook && defaultApi === 'facebook') blockers.push(t('doctor_missing_facebook'));
    if (!tokens.instagram && defaultApi === 'instagram') blockers.push(t('doctor_missing_instagram'));
    if (!tokens.whatsapp && defaultApi === 'whatsapp') blockers.push(t('doctor_missing_whatsapp'));

    // Non-default APIs are optional; keep as advisory only.
    const optionalMissing = [];
    if (!tokens.facebook && defaultApi !== 'facebook') optionalMissing.push('facebook');
    if (!tokens.instagram && defaultApi !== 'instagram') optionalMissing.push('instagram');
    if (!tokens.whatsapp && defaultApi !== 'whatsapp') optionalMissing.push('whatsapp');
    if (optionalMissing.length) {
      advisories.push(`Optional API tokens not configured: ${optionalMissing.join(', ')}.`);
    }
  }

  if (!appCredentialsConfigured) {
    advisories.push(t('doctor_missing_app_creds'));
  }

  if (!defaults.marketingAdAccountId) {
    advisories.push(t('doctor_missing_ad_account'));
  }

  if (defaultApi && !tokens[defaultApi]) {
    blockers.push(t('doctor_default_api_missing_token', { api: defaultApi }));
  }

  return {
    configPath: config.getConfigPath(),
    activeProfile,
    profiles,
    apiVersion,
    defaultApi,
    tokens,
    appCredentialsConfigured,
    defaults,
    blockers,
    advisories,
    autoFixes
  };
}

function runDoctor(options) {
  const snapshot = buildSnapshot({ autoFix: true });

  if (options.json) {
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }

  const hasBlockers = snapshot.blockers.length > 0;
  const hasAdvisories = snapshot.advisories.length > 0;
  const healthBadge = hasBlockers
    ? formatBadge('ATTENTION', { tone: 'danger' })
    : (hasAdvisories ? formatBadge('READY WITH TIPS', { tone: 'info' }) : formatBadge('READY', { tone: 'success' }));

  console.log('');
  console.log(renderPanel({
    title: ' Doctor Snapshot ',
    rows: [
      kv('Profile', chalk.cyan(snapshot.activeProfile), { labelWidth: 14 }),
      kv('Default API', chalk.cyan(snapshot.defaultApi || 'facebook'), { labelWidth: 14 }),
      kv('Health', healthBadge, { labelWidth: 14 }),
      kv('Config', chalk.gray(snapshot.configPath), { labelWidth: 14 })
    ],
    minWidth: 78,
    borderColor: (value) => chalk.blueBright(value)
  }));

  if (snapshot.autoFixes.length) {
    console.log('');
    console.log(renderPanel({
      title: ' Auto-Fixes Applied ',
      rows: snapshot.autoFixes.map((line, index) => `${index + 1}. ${chalk.green(line)}`),
      minWidth: 78,
      borderColor: (value) => chalk.green(value)
    }));
  }

  config.display();

  const allHints = [...snapshot.blockers, ...snapshot.advisories];
  if (allHints.length) {
    console.log(renderPanel({
      title: ` ${t('doctor_next_steps')} `,
      rows: allHints.map((hint, index) => {
        const color = index < snapshot.blockers.length ? chalk.red : chalk.cyan;
        return `${index + 1}. ${color(hint)}`;
      }),
      minWidth: 78,
      borderColor: (value) => chalk.yellow(value)
    }));
    console.log('');
  } else {
    console.log(renderPanel({
      title: ` ${t('doctor_next_steps')} `,
      rows: [chalk.green('No blocking issues detected.')],
      minWidth: 78,
      borderColor: (value) => chalk.green(value)
    }));
    console.log('');
  }
}

function addDoctorLikeCommand(command, { name, description }) {
  return command
    .command(name)
    .description(description)
    .option('--json', 'Output as JSON')
    .action(runDoctor);
}

function registerDoctorCommands(program) {
  addDoctorLikeCommand(program, {
    name: 'doctor',
    description: 'Quick diagnostics (config + setup hints)'
  });

  // Aliases for muscle memory / simplified UX.
  addDoctorLikeCommand(program, {
    name: 'config',
    description: 'Alias for "doctor"'
  });
  addDoctorLikeCommand(program, {
    name: 'diag',
    description: 'Alias for "doctor"'
  });
}

module.exports = registerDoctorCommands;
