const config = require('./config');

function getTokenState(cfg) {
  const byApi = {
    facebook: Boolean(cfg.hasToken('facebook')),
    instagram: Boolean(cfg.hasToken('instagram')),
    whatsapp: Boolean(cfg.hasToken('whatsapp'))
  };
  return {
    byApi,
    anyConfigured: Boolean(byApi.facebook || byApi.instagram || byApi.whatsapp)
  };
}

function buildReadinessReport(options = {}) {
  const cfg = options.config || config;
  const includeWarnings = options.includeWarnings !== false;

  const activeProfile = cfg.getActiveProfile();
  const defaultApi = cfg.getDefaultApi();
  const tokenState = getTokenState(cfg);
  const onboardingCompleted = Boolean(cfg.hasCompletedOnboarding());
  const appCredentialsConfigured = Boolean(cfg.hasAppCredentials());

  const blockers = [];
  const warnings = [];
  const nextActions = [];

  if (!tokenState.anyConfigured) {
    blockers.push({
      code: 'missing_tokens',
      message: 'No API token is configured for this profile.',
      fix: 'Run: social setup'
    });
  }

  if (defaultApi && !tokenState.byApi[defaultApi]) {
    blockers.push({
      code: 'default_api_token_missing',
      message: `Default API "${defaultApi}" has no token configured.`,
      fix: `Run: social auth login -a ${defaultApi}`
    });
  }

  if (!onboardingCompleted && includeWarnings) {
    warnings.push({
      code: 'onboarding_incomplete',
      message: 'Onboarding is not marked complete for this profile.',
      fix: 'Run: social onboard --no-hatch'
    });
  }

  if (!appCredentialsConfigured && includeWarnings) {
    warnings.push({
      code: 'app_credentials_missing',
      message: 'App ID / App Secret are not configured (needed for OAuth and advanced diagnostics).',
      fix: 'Run: social auth app'
    });
  }

  if (blockers.length) {
    nextActions.push('social setup');
    if (defaultApi) nextActions.push(`social auth login -a ${defaultApi}`);
  } else {
    nextActions.push('social start');
    nextActions.push('social doctor');
  }

  return {
    ok: blockers.length === 0,
    activeProfile,
    defaultApi,
    onboardingCompleted,
    appCredentialsConfigured,
    anyTokenConfigured: tokenState.anyConfigured,
    tokens: tokenState.byApi,
    blockers,
    warnings,
    nextActions: Array.from(new Set(nextActions))
  };
}

module.exports = {
  buildReadinessReport
};
