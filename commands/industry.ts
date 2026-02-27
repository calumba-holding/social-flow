const chalk = require('chalk');
const inquirer = require('inquirer');

const config = require('../lib/config');
const {
  detectIndustry,
  normalizeIndustry,
  INDUSTRIES,
  INDUSTRY_LABELS,
  CONFIDENCE_THRESHOLDS
} = require('../lib/industry/detector');

function normalizeArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((x) => String(x || '').trim()).filter(Boolean);
}

function resolveAccountId(options) {
  const raw = String(options.account || '').trim();
  if (raw) return raw;
  return String(config.getDefaultMarketingAdAccountId() || '').trim();
}

function printIndustryState(state, accountId) {
  const profile = config.getActiveProfile();
  console.log(chalk.bold('\nIndustry Mode'));
  console.log(chalk.gray(`  profile: ${profile}`));
  console.log(chalk.gray(`  account: ${accountId || '(profile default)'}`));
  console.log(chalk.gray(`  mode: ${state.mode}`));
  console.log(chalk.gray(`  selected: ${state.selected || '(not set)'}`));
  console.log(chalk.gray(`  source: ${state.source || '(none)'}`));
  console.log(chalk.gray(`  confidence: ${state.confidence || 0}`));
  console.log(chalk.gray(`  manual lock: ${state.manualLocked ? 'on' : 'off'}`));
  if (state.detectedAt) console.log(chalk.gray(`  detectedAt: ${state.detectedAt}`));
  if (state.detectorVersion) console.log(chalk.gray(`  detector: ${state.detectorVersion}`));
  console.log('');
}

function printDetection(result) {
  const conf = Number(result.confidence || 0);
  const tone = conf >= CONFIDENCE_THRESHOLDS.high
    ? chalk.green
    : conf >= CONFIDENCE_THRESHOLDS.medium
      ? chalk.yellow
      : chalk.red;
  console.log(chalk.bold('\nIndustry Detection'));
  console.log(chalk.gray(`  recommended: ${result.recommended} (${result.recommendedLabel || result.recommended})`));
  console.log(chalk.gray(`  confidence: ${tone(`${conf} (${result.confidenceBand})`)}`));
  console.log(chalk.gray(`  margin: ${result.margin}`));
  if (Array.isArray(result.reasons) && result.reasons.length) {
    console.log(chalk.gray('  why:'));
    result.reasons.forEach((reason, index) => {
      console.log(chalk.gray(`    ${index + 1}. ${reason}`));
    });
  }
  console.log(chalk.gray('\n  alternatives:'));
  (result.ranked || []).slice(0, 3).forEach((row, index) => {
    console.log(chalk.gray(`    ${index + 1}. ${row.industry} (${row.score})`));
  });
  console.log('');
}

async function shouldApplyMediumConfidence(options, result) {
  if (options.apply || options.yes) return true;
  if (!process.stdout.isTTY || !process.stdin.isTTY) return false;
  const answer = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      default: true,
      message: `Detected ${result.recommendedLabel || result.recommended} with medium confidence (${result.confidence}). Apply now?`
    }
  ]);
  return Boolean(answer.confirm);
}

function registerIndustryCommands(program) {
  const industry = program
    .command('industry')
    .description('Industry-aware performance mode (hybrid detect + manual override)');

  industry
    .command('show')
    .description('Show current industry mode/state')
    .option('--account <id>', 'Optional ad account override scope')
    .option('--json', 'Output JSON')
    .action((options) => {
      const accountId = resolveAccountId(options);
      const state = config.getIndustryConfig({ accountId });
      if (options.json) {
        console.log(JSON.stringify({
          profile: config.getActiveProfile(),
          accountId,
          industry: state
        }, null, 2));
        return;
      }
      printIndustryState(state, accountId);
    });

  industry
    .command('mode <mode>')
    .description('Set detection mode: hybrid|auto|manual')
    .option('--json', 'Output JSON')
    .action((mode, options) => {
      const value = String(mode || '').trim().toLowerCase();
      if (!['hybrid', 'auto', 'manual'].includes(value)) {
        console.error(chalk.red('Invalid mode. Choose: hybrid | auto | manual'));
        process.exit(1);
      }
      const next = config.setIndustryMode(value);
      if (options.json) {
        console.log(JSON.stringify({ profile: config.getActiveProfile(), industry: next }, null, 2));
        return;
      }
      console.log(chalk.green(`\nIndustry mode set to ${next.mode}.\n`));
    });

  industry
    .command('set <industryId>')
    .description('Manually set industry and lock override')
    .option('--account <id>', 'Optional ad account override scope')
    .option('--json', 'Output JSON')
    .action((industryId, options) => {
      const normalized = normalizeIndustry(industryId);
      if (!normalized) {
        console.error(chalk.red(`Unsupported industry: ${industryId}`));
        console.error(chalk.gray(`Supported: ${INDUSTRIES.join(', ')}`));
        process.exit(1);
      }
      const accountId = resolveAccountId(options);
      const next = config.setIndustryManual(normalized, { accountId });
      if (options.json) {
        console.log(JSON.stringify({ profile: config.getActiveProfile(), accountId, industry: next }, null, 2));
        return;
      }
      console.log(chalk.green(`\nManual industry set: ${normalized} (${INDUSTRY_LABELS[normalized] || normalized}).`));
      console.log(chalk.gray('Manual lock is now ON.\n'));
    });

  industry
    .command('unlock')
    .description('Unlock manual override so hybrid/auto detect can update industry')
    .option('--account <id>', 'Optional ad account override scope')
    .option('--json', 'Output JSON')
    .action((options) => {
      const accountId = resolveAccountId(options);
      const next = config.unlockIndustry({ accountId });
      if (options.json) {
        console.log(JSON.stringify({ profile: config.getActiveProfile(), accountId, industry: next }, null, 2));
        return;
      }
      console.log(chalk.green('\nIndustry manual lock disabled.\n'));
    });

  industry
    .command('detect')
    .description('Detect best-fit industry from campaign/objective/event signals')
    .option('--account <id>', 'Optional ad account scope (defaults to configured ad account)')
    .option('--campaign <names...>', 'Campaign names for scoring')
    .option('--objective <names...>', 'Objective names for scoring')
    .option('--event <names...>', 'Pixel/conversion event names for scoring')
    .option('--geo <text>', 'Geo hint text, e.g. "Dubai Marina"')
    .option('--text <text>', 'Additional free-form context')
    .option('--apply', 'Apply detection result immediately')
    .option('--yes', 'Skip confirmation prompt for medium confidence')
    .option('--force', 'Apply even if manual lock is enabled')
    .option('--json', 'Output JSON')
    .action(async (options) => {
      const accountId = resolveAccountId(options);
      const region = config.getRegionConfig();
      const detectionInput = {
        text: String(options.text || '').trim(),
        campaignNames: normalizeArray(options.campaign),
        objectives: normalizeArray(options.objective),
        events: normalizeArray(options.event),
        geo: String(options.geo || [region.country, region.timezone].filter(Boolean).join(' ')).trim(),
        country: region.country,
        timezone: region.timezone,
        defaultApi: config.getDefaultApi(),
        accountId
      };

      const result = detectIndustry(detectionInput);
      const current = config.getIndustryConfig({ accountId });

      let applyNow = false;
      let applyReason = 'none';

      if (current.manualLocked && !options.force) {
        applyReason = 'manual_lock';
      } else if (options.apply) {
        applyNow = true;
        applyReason = 'forced_apply';
      } else if (current.mode === 'manual') {
        applyReason = 'manual_mode';
      } else if (result.confidence >= CONFIDENCE_THRESHOLDS.high) {
        applyNow = true;
        applyReason = 'high_confidence_auto';
      } else if (result.confidence >= CONFIDENCE_THRESHOLDS.medium) {
        applyNow = await shouldApplyMediumConfidence(options, result);
        applyReason = applyNow ? 'medium_confirmed' : 'medium_needs_confirmation';
      } else {
        applyReason = 'low_confidence';
      }

      let next = current;
      if (applyNow) {
        next = config.setIndustryDetection({
          selected: result.recommended,
          confidence: result.confidence,
          detectorVersion: result.detectorVersion,
          detectedAt: new Date().toISOString(),
          manualLocked: false
        }, { accountId });
      }

      if (options.json) {
        console.log(JSON.stringify({
          profile: config.getActiveProfile(),
          accountId,
          detection: result,
          before: current,
          after: next,
          applyNow,
          applyReason
        }, null, 2));
        return;
      }

      printDetection(result);
      printIndustryState(next, accountId);

      if (applyNow) {
        console.log(chalk.green(`Applied detected industry: ${next.selected || result.recommended}\n`));
      } else if (applyReason === 'manual_lock') {
        console.log(chalk.yellow('Manual lock is enabled. Run `social industry unlock` or pass --force to override.\n'));
      } else if (applyReason === 'manual_mode') {
        console.log(chalk.yellow('Mode is manual. Detection is advisory only. Use `social industry set <industry>`.\n'));
      } else if (applyReason === 'low_confidence') {
        console.log(chalk.yellow('Confidence is low. Recommend manual selection:'));
        console.log(chalk.gray(`  social industry set ${result.recommended}\n`));
      } else if (applyReason === 'medium_needs_confirmation') {
        console.log(chalk.yellow('Medium confidence result not applied. Re-run with --apply if you want to accept it.\n'));
      }
    });
}

module.exports = registerIndustryCommands;
