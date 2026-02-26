const assert = require('node:assert/strict');
const { deriveGuidanceSteps } = require('../lib/guidance');

module.exports = [
  {
    name: 'guidance sequence recommends setup when onboarding/token is incomplete',
    fn: () => {
      const state = deriveGuidanceSteps({
        readiness: {
          ok: false,
          anyTokenConfigured: false,
          onboardingCompleted: false,
          appCredentialsConfigured: false
        },
        health: { ok: false }
      });
      assert.equal(state.next.command, 'social setup');
    }
  },
  {
    name: 'guidance sequence recommends start when readiness is done but gateway is down',
    fn: () => {
      const state = deriveGuidanceSteps({
        readiness: {
          ok: true,
          anyTokenConfigured: true,
          onboardingCompleted: true,
          appCredentialsConfigured: true
        },
        health: { ok: false }
      });
      assert.equal(state.next.command, 'social start');
    }
  },
  {
    name: 'guidance sequence recommends hatch when core steps are complete',
    fn: () => {
      const state = deriveGuidanceSteps({
        readiness: {
          ok: true,
          anyTokenConfigured: true,
          onboardingCompleted: true,
          appCredentialsConfigured: true
        },
        health: { ok: true }
      });
      assert.equal(state.next.command, 'social hatch');
    }
  }
];
