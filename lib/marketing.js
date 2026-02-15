const chalk = require('chalk');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const MetaAPIClient = require('./api-client');
const { sanitizeForLog } = require('./api');
const { formatTable } = require('./formatters');

function parseCsv(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.flatMap(parseCsv);
  return String(v).split(',').map((s) => s.trim()).filter(Boolean);
}

function normalizeAct(adAccountId) {
  const s = String(adAccountId || '').trim();
  if (!s) return '';
  if (s.startsWith('act_')) return s;
  // Some folks pass act_<id> with leading "act_" or just <id>.
  if (/^\d+$/.test(s)) return `act_${s}`;
  return s;
}

function ensureMarketingToken() {
  const token = config.getToken('facebook');
  if (!token) {
    console.error(chalk.red('X No Facebook token found. Run: meta auth login -a facebook'));
    process.exit(1);
  }
  return token;
}

function warnIfOldApiVersion() {
  const v = config.getApiVersion() || 'v0.0';
  const m = v.match(/^v(\d+)\.(\d+)$/);
  if (!m) return;
  const major = parseInt(m[1], 10);
  // Marketing API behaves best on newer versions; don't block, just warn.
  if (major < 24) {
    console.log(chalk.yellow(`! Note: Your Graph API version is ${v}. Marketing API guidance here assumes v24.0+.`));
    console.log(chalk.gray('  You can set it via: meta utils version set v24.0'));
    console.log('');
  }
}

async function paginate(client, endpoint, params = {}, opts = {}) {
  const out = [];
  let after = null;
  while (true) {
    const pageParams = { ...(params || {}) };
    if (after) pageParams.after = after;
    if (!pageParams.limit) pageParams.limit = 100;

    // eslint-disable-next-line no-await-in-loop
    const res = await client.get(endpoint, pageParams, opts);
    const data = res?.data || [];
    out.push(...data);

    const nextAfter = res?.paging?.cursors?.after;
    const hasNext = Boolean(nextAfter && res?.paging?.next);
    if (!hasNext) break;
    after = nextAfter;
  }
  return out;
}

function sumNumeric(rows, key) {
  return (rows || []).reduce((acc, r) => {
    const v = r?.[key];
    const n = typeof v === 'number' ? v : parseFloat(v);
    if (!Number.isFinite(n)) return acc;
    return acc + n;
  }, 0);
}

function summarizeInsights(rows) {
  const spend = sumNumeric(rows, 'spend');
  const impressions = sumNumeric(rows, 'impressions');
  const clicks = sumNumeric(rows, 'clicks');
  return { spend, impressions, clicks };
}

function printInsightsSummary(summary) {
  console.log(chalk.bold('\nSummary:'));
  console.log(chalk.cyan('  Spend:'), chalk.green(summary.spend.toFixed(2)));
  console.log(chalk.cyan('  Impressions:'), String(Math.round(summary.impressions)));
  console.log(chalk.cyan('  Clicks:'), String(Math.round(summary.clicks)));
  console.log('');
}

async function requestWithHeaders({ token, url, params }) {
  const res = await axios.get(url, {
    params: { ...(params || {}), access_token: token },
    validateStatus: () => true
  });
  return res;
}

async function getAdsRateLimitSnapshot(act, token) {
  const apiVersion = config.getApiVersion();
  const baseUrl = `https://graph.facebook.com/${apiVersion}`;
  const url = `${baseUrl}/${act}`;

  const res = await requestWithHeaders({
    token,
    url,
    params: { fields: 'id' }
  });

  const h = res.headers || {};
  return {
    x_business_use_case_usage: h['x-business-use-case-usage'] || '',
    x_ad_account_usage: h['x-ad-account-usage'] || '',
    x_app_usage: h['x-app-usage'] || '',
    x_fb_ads_insights_throttle: h['x-fb-ads-insights-throttle'] || ''
  };
}

async function startAsyncInsightsJob({ client, act, params, opts }) {
  // Ads Insights async: POST /act_<id>/insights?async=true...
  // Response typically contains { report_run_id: "..." }.
  const job = await client.post(`/${act}/insights`, {}, { ...params, async: 'true' }, opts);
  const id = job?.report_run_id || job?.id;
  if (!id) {
    throw new Error('Failed to start async insights job (missing report_run_id).');
  }
  return id;
}

function isJobComplete(status, pct) {
  const s = String(status || '').toLowerCase();
  if (s.includes('completed') || s.includes('complete')) return true;
  if (s.includes('failed') || s.includes('error')) return false;
  return Number(pct) >= 100;
}

async function pollInsightsJob({ client, reportRunId, pollIntervalSec, timeoutSec, verbose, onProgress }) {
  const start = Date.now();
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const info = await client.get(`/${reportRunId}`, { fields: 'async_status,async_percent_completion' }, { verbose });
    const st = info?.async_status;
    const pct = info?.async_percent_completion;

    if (typeof onProgress === 'function') {
      try {
        onProgress({ status: st, percent: pct });
      } catch {
        // ignore
      }
    }

    if (isJobComplete(st, pct)) {
      const s = String(st || '').toLowerCase();
      if (s.includes('failed') || s.includes('error')) {
        throw new Error(`Insights job failed (status=${st}, pct=${pct})`);
      }
      return info;
    }

    const elapsedSec = (Date.now() - start) / 1000;
    if (elapsedSec > timeoutSec) throw new Error('Insights job timed out while polling.');

    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, pollIntervalSec * 1000));
  }
}

async function fetchAsyncInsightsResults({ client, reportRunId, opts }) {
  // Result pagination lives under /<report_run_id>/insights
  const rows = await paginate(client, `/${reportRunId}/insights`, { limit: 500 }, opts);
  return rows;
}

function sanitizeRowsForJson(rows) {
  return sanitizeForLog(rows);
}

function printTableOrJson({ rows, columns, json }) {
  if (json) {
    console.log(JSON.stringify(sanitizeRowsForJson(rows), null, 2));
    return;
  }
  console.log(formatTable(rows, columns));
  console.log('');
}

function inferExportFormat(exportPath, explicitFormat) {
  if (explicitFormat) return String(explicitFormat).toLowerCase();
  const ext = path.extname(String(exportPath || '')).toLowerCase();
  if (ext === '.csv') return 'csv';
  if (ext === '.json') return 'json';
  return 'csv';
}

function toCsv(rows, columns) {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (!safeRows.length) return '';

  const cols = (columns && columns.length) ? columns : Object.keys(safeRows[0] || {});

  const esc = (v) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    const s = String(v);
    // RFC4180-ish quoting.
    if (/[,"\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const lines = [];
  lines.push(cols.map(esc).join(','));
  safeRows.forEach((r) => {
    lines.push(cols.map((c) => esc(r?.[c])).join(','));
  });
  return lines.join('\n') + '\n';
}

function writeFileAtomic(filePath, content) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, filePath);
}

module.exports = {
  parseCsv,
  normalizeAct,
  ensureMarketingToken,
  warnIfOldApiVersion,
  paginate,
  summarizeInsights,
  printInsightsSummary,
  getAdsRateLimitSnapshot,
  startAsyncInsightsJob,
  pollInsightsJob,
  fetchAsyncInsightsResults,
  printTableOrJson,
  inferExportFormat,
  toCsv,
  writeFileAtomic,
  MetaAPIClient
};
