import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function getEnv(name: string, fallback = ''): string {
  const v = String(process.env[name] || '').trim();
  return v || fallback;
}

function latestReportPath(clientId: string): string {
  const reportsDir = path.resolve(process.cwd(), 'reports');
  if (!fs.existsSync(reportsDir)) throw new Error(`Reports dir not found: ${reportsDir}`);
  const rows = fs.readdirSync(reportsDir)
    .filter((x) => x.startsWith(`staging-verification-${clientId}-`) && (x.endsWith('.md') || x.endsWith('.json')))
    .map((x) => ({
      file: path.join(reportsDir, x),
      mtime: fs.statSync(path.join(reportsDir, x)).mtimeMs,
      isMd: x.endsWith('.md')
    }))
    .sort((a, b) => b.mtime - a.mtime);
  if (!rows.length) throw new Error(`No report files found for client ${clientId}`);
  const md = rows.find((x) => x.isMd);
  return (md || rows[0]).file;
}

async function main() {
  const baseUrl = getEnv('SOCIALCLAW_API_BASE', 'http://127.0.0.1:8080').replace(/\/+$/, '');
  const token = getEnv('SOCIALCLAW_BEARER');
  const clientId = getEnv('SOCIALCLAW_CLIENT_ID');
  const releaseTag = getEnv('SOCIALCLAW_RELEASE_TAG');
  const reportPathInput = getEnv('SOCIALCLAW_REPORT_PATH');

  if (!token || !clientId || !releaseTag) {
    throw new Error('Missing required env: SOCIALCLAW_BEARER, SOCIALCLAW_CLIENT_ID, SOCIALCLAW_RELEASE_TAG');
  }

  const reportPath = reportPathInput ? path.resolve(reportPathInput) : latestReportPath(clientId);
  if (!fs.existsSync(reportPath)) throw new Error(`Report file not found: ${reportPath}`);
  const reportContent = fs.readFileSync(reportPath);
  const reportSha256 = createHash('sha256').update(reportContent).digest('hex');

  const res = await fetch(`${baseUrl}/v1/releases/signoff/latest?clientId=${encodeURIComponent(clientId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({ ok: false, statusCode: res.status, response: payload }, null, 2));
    process.exit(1);
  }

  const signoff = payload && payload.signoff ? payload.signoff : null;
  if (!signoff) throw new Error('No release signoff found for client.');

  const errors: string[] = [];
  if (String(signoff.status || '') !== 'approved') errors.push(`Latest signoff status is ${String(signoff.status || '')}`);
  if (String(signoff.release_tag || '') !== releaseTag) errors.push(`Release tag mismatch: expected=${releaseTag} got=${String(signoff.release_tag || '')}`);
  if (String(signoff.report_sha256 || '') !== reportSha256) {
    errors.push('Report SHA-256 mismatch between local report and locked signoff record.');
  }

  const result = {
    ok: errors.length === 0,
    clientId,
    releaseTag,
    reportPath,
    reportSha256,
    signoff,
    errors
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(result, null, 2));
  if (errors.length) process.exit(1);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error && (error as Error).message ? (error as Error).message : String(error));
  process.exit(1);
});
