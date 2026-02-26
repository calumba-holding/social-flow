const assert = require('node:assert/strict');
const { buildReadinessReport } = require('../lib/readiness');
const { tailLines } = require('../lib/gateway/manager');

function mockConfig(input = {}) {
  const tokens = input.tokens || {};
  return {
    getActiveProfile: () => input.activeProfile || 'default',
    getDefaultApi: () => input.defaultApi || 'facebook',
    hasToken: (api) => Boolean(tokens[api]),
    hasCompletedOnboarding: () => Boolean(input.onboardingCompleted),
    hasAppCredentials: () => Boolean(input.appCredentialsConfigured)
  };
}

module.exports = [
  {
    name: 'readiness report blocks start when no tokens are configured',
    fn: () => {
      const report = buildReadinessReport({
        config: mockConfig({
          defaultApi: 'facebook',
          tokens: {},
          onboardingCompleted: false,
          appCredentialsConfigured: false
        })
      });
      assert.equal(report.ok, false);
      assert.equal(report.blockers.length > 0, true);
      assert.equal(report.anyTokenConfigured, false);
    }
  },
  {
    name: 'readiness report is ok when default API token exists',
    fn: () => {
      const report = buildReadinessReport({
        config: mockConfig({
          defaultApi: 'facebook',
          tokens: { facebook: true },
          onboardingCompleted: true,
          appCredentialsConfigured: true
        })
      });
      assert.equal(report.ok, true);
      assert.equal(report.blockers.length, 0);
      assert.equal(report.anyTokenConfigured, true);
    }
  },
  {
    name: 'gateway manager tailLines returns requested trailing lines',
    fn: () => {
      const text = ['one', 'two', 'three', 'four'].join('\n');
      assert.equal(tailLines(text, 2), 'three\nfour');
      assert.equal(tailLines(text, 1), 'four');
    }
  }
];
