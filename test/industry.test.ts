const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const configSingleton = require('../lib/config');
const detector = require('../lib/industry/detector');

function withTempHome(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'social-industry-test-'));
  const oldMeta = process.env.META_CLI_HOME;
  const oldSocial = process.env.SOCIAL_CLI_HOME;
  process.env.META_CLI_HOME = dir;
  process.env.SOCIAL_CLI_HOME = dir;
  try {
    return fn(dir);
  } finally {
    if (oldMeta === undefined) delete process.env.META_CLI_HOME;
    else process.env.META_CLI_HOME = oldMeta;
    if (oldSocial === undefined) delete process.env.SOCIAL_CLI_HOME;
    else process.env.SOCIAL_CLI_HOME = oldSocial;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = [
  {
    name: 'industry detector identifies real estate from property + UAE signals',
    fn: () => {
      const out = detector.detectIndustry({
        campaignNames: ['Dubai Marina Luxury Apartments Lead Gen'],
        objectives: ['LEAD_GENERATION'],
        events: ['Lead'],
        geo: 'Dubai UAE'
      });
      assert.equal(out.recommended, 'real_estate');
      assert.equal(typeof out.confidence, 'number');
      assert.equal(Array.isArray(out.ranked), true);
      assert.equal(out.ranked.length >= 3, true);
    }
  },
  {
    name: 'industry detector identifies ecommerce from purchase/cart signals',
    fn: () => {
      const out = detector.detectIndustry({
        campaignNames: ['Summer SKU Flash Sale'],
        objectives: ['SALES'],
        events: ['Purchase', 'AddToCart', 'InitiateCheckout'],
        text: 'ROAS drop on top SKU'
      });
      assert.equal(out.recommended, 'ecommerce');
      assert.equal(out.confidence >= detector.CONFIDENCE_THRESHOLDS.medium, true);
    }
  },
  {
    name: 'industry config supports mode, manual lock, and account overrides',
    fn: () => withTempHome(() => {
      const { ConfigManager } = configSingleton;
      const cfg = new ConfigManager();

      const initial = cfg.getIndustryConfig();
      assert.equal(initial.mode, 'hybrid');
      assert.equal(initial.manualLocked, false);

      cfg.setIndustryMode('manual');
      assert.equal(cfg.getIndustryConfig().mode, 'manual');

      cfg.setIndustryManual('edtech');
      const manual = cfg.getIndustryConfig();
      assert.equal(manual.selected, 'edtech');
      assert.equal(manual.source, 'manual');
      assert.equal(manual.manualLocked, true);

      cfg.setIndustryDetection({
        selected: 'ecommerce',
        confidence: 0.8,
        detectorVersion: 'heuristic-v1'
      }, { accountId: 'act_123' });
      const accountScoped = cfg.getIndustryConfig({ accountId: 'act_123' });
      assert.equal(accountScoped.selected, 'ecommerce');
      assert.equal(accountScoped.source, 'auto');
      assert.equal(accountScoped.hasOverride, true);
    })
  },
  {
    name: 'industry unlock turns off manual lock without clearing selection',
    fn: () => withTempHome(() => {
      const { ConfigManager } = configSingleton;
      const cfg = new ConfigManager();
      cfg.setIndustryManual('healthcare');
      const before = cfg.getIndustryConfig();
      assert.equal(before.manualLocked, true);
      cfg.unlockIndustry();
      const after = cfg.getIndustryConfig();
      assert.equal(after.manualLocked, false);
      assert.equal(after.selected, 'healthcare');
    })
  }
];
