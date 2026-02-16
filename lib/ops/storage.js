const fs = require('fs');
const os = require('os');
const path = require('path');
const configSingleton = require('../config');

const DEFAULT_POLICY = {
  spendThreshold: 200,
  autoApproveLowRisk: false,
  followupAfterDays: 3,
  requireApprovalForCampaignPause: true,
  requireApprovalForBulkWhatsApp: true
};

const DEFAULT_STATE = {
  lastMorningRunDate: '',
  runHistory: []
};
const DEFAULT_INTEGRATIONS = {
  slackWebhook: '',
  outboundWebhook: ''
};
let cachedOpsRoot = '';

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function homeRoot() {
  if (process.env.SOCIAL_CLI_HOME) return path.resolve(process.env.SOCIAL_CLI_HOME);
  if (process.env.META_CLI_HOME) return path.resolve(process.env.META_CLI_HOME);
  return os.homedir();
}

function sanitizeWorkspace(name) {
  if (typeof configSingleton?.sanitizeProfileName === 'function') {
    return configSingleton.sanitizeProfileName(name);
  }
  const raw = String(name || '').trim();
  const safe = raw.replace(/[^a-zA-Z0-9._-]/g, '_');
  return safe || 'default';
}

function opsRoot() {
  if (cachedOpsRoot) return cachedOpsRoot;

  const home = homeRoot();
  const candidates = [
    path.join(home, '.social-cli', 'ops'),
    path.join(home, '.meta-cli', 'ops'),
    path.join(process.cwd(), '.social-cli-ops')
  ];

  // Pick first writable location.
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    try {
      ensureDir(candidate);
      cachedOpsRoot = candidate;
      return cachedOpsRoot;
    } catch {
      // try next
    }
  }

  throw new Error('Unable to initialize ops storage directory.');
}

function workspaceDir(workspace) {
  return path.join(opsRoot(), sanitizeWorkspace(workspace));
}

function rolesPath() {
  return path.join(opsRoot(), 'roles.json');
}

function filePath(workspace, key) {
  return path.join(workspaceDir(workspace), `${key}.json`);
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(file, value) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function genId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function ensureWorkspace(workspace) {
  const ws = sanitizeWorkspace(workspace);
  const dir = workspaceDir(ws);
  ensureDir(dir);

  const defaults = {
    leads: [],
    alerts: [],
    approvals: [],
    outcomes: [],
    schedules: [],
    policy: DEFAULT_POLICY,
    state: DEFAULT_STATE,
    integrations: DEFAULT_INTEGRATIONS
  };

  Object.keys(defaults).forEach((k) => {
    const f = filePath(ws, k);
    if (!fs.existsSync(f)) writeJsonAtomic(f, defaults[k]);
  });

  return ws;
}

function listLeads(workspace) {
  ensureWorkspace(workspace);
  return readJson(filePath(workspace, 'leads'), []);
}

function addLead(workspace, input) {
  const ws = ensureWorkspace(workspace);
  const leads = listLeads(ws);
  const now = new Date().toISOString();
  const lead = {
    id: genId('lead'),
    name: String(input?.name || '').trim(),
    phone: String(input?.phone || '').trim(),
    status: String(input?.status || 'new').trim(),
    tags: Array.isArray(input?.tags) ? input.tags : [],
    note: String(input?.note || ''),
    lastContactAt: input?.lastContactAt || null,
    createdAt: now,
    updatedAt: now
  };
  leads.push(lead);
  writeJsonAtomic(filePath(ws, 'leads'), leads);
  return lead;
}

function updateLead(workspace, leadId, patch) {
  const ws = ensureWorkspace(workspace);
  const leads = listLeads(ws);
  const idx = leads.findIndex((x) => x.id === leadId);
  if (idx < 0) throw new Error(`Lead not found: ${leadId}`);
  const now = new Date().toISOString();
  const next = {
    ...leads[idx],
    ...patch,
    updatedAt: now
  };
  leads[idx] = next;
  writeJsonAtomic(filePath(ws, 'leads'), leads);
  return next;
}

function listAlerts(workspace) {
  ensureWorkspace(workspace);
  return readJson(filePath(workspace, 'alerts'), []);
}

function addAlert(workspace, input) {
  const ws = ensureWorkspace(workspace);
  const alerts = listAlerts(ws);
  const dedupeKey = String(input?.dedupeKey || '').trim();
  if (dedupeKey) {
    const existing = alerts.find((a) => a.status === 'open' && a.dedupeKey === dedupeKey);
    if (existing) return existing;
  }
  const alert = {
    id: genId('alert'),
    type: String(input?.type || 'generic'),
    severity: String(input?.severity || 'low'),
    message: String(input?.message || ''),
    meta: input?.meta && typeof input.meta === 'object' ? input.meta : {},
    status: 'open',
    dedupeKey: dedupeKey || null,
    createdAt: new Date().toISOString(),
    ackAt: null
  };
  alerts.push(alert);
  writeJsonAtomic(filePath(ws, 'alerts'), alerts);
  return alert;
}

function ackAlert(workspace, alertId) {
  const ws = ensureWorkspace(workspace);
  const alerts = listAlerts(ws);
  const idx = alerts.findIndex((a) => a.id === alertId);
  if (idx < 0) throw new Error(`Alert not found: ${alertId}`);
  alerts[idx] = {
    ...alerts[idx],
    status: 'acked',
    ackAt: new Date().toISOString()
  };
  writeJsonAtomic(filePath(ws, 'alerts'), alerts);
  return alerts[idx];
}

function listApprovals(workspace) {
  ensureWorkspace(workspace);
  return readJson(filePath(workspace, 'approvals'), []);
}

function addApproval(workspace, input) {
  const ws = ensureWorkspace(workspace);
  const approvals = listApprovals(ws);
  const approval = {
    id: genId('approval'),
    title: String(input?.title || 'Approval required'),
    reason: String(input?.reason || ''),
    risk: String(input?.risk || 'medium'),
    action: String(input?.action || 'manual'),
    payload: input?.payload && typeof input.payload === 'object' ? input.payload : {},
    status: 'pending',
    requestedAt: new Date().toISOString(),
    decidedAt: null,
    decidedBy: null,
    decisionNote: ''
  };
  approvals.push(approval);
  writeJsonAtomic(filePath(ws, 'approvals'), approvals);
  return approval;
}

function resolveApproval(workspace, approvalId, decision) {
  const ws = ensureWorkspace(workspace);
  const approvals = listApprovals(ws);
  const idx = approvals.findIndex((a) => a.id === approvalId);
  if (idx < 0) throw new Error(`Approval not found: ${approvalId}`);
  const current = approvals[idx];
  if (current.status !== 'pending') return current;
  approvals[idx] = {
    ...current,
    status: decision.status,
    decidedAt: new Date().toISOString(),
    decidedBy: decision.user || 'system',
    decisionNote: String(decision.note || '')
  };
  writeJsonAtomic(filePath(ws, 'approvals'), approvals);
  return approvals[idx];
}

function listOutcomes(workspace) {
  ensureWorkspace(workspace);
  return readJson(filePath(workspace, 'outcomes'), []);
}

function appendOutcome(workspace, input) {
  const ws = ensureWorkspace(workspace);
  const outcomes = listOutcomes(ws);
  const out = {
    id: genId('outcome'),
    kind: String(input?.kind || 'run'),
    summary: String(input?.summary || ''),
    metrics: input?.metrics && typeof input.metrics === 'object' ? input.metrics : {},
    metadata: input?.metadata && typeof input.metadata === 'object' ? input.metadata : {},
    createdAt: new Date().toISOString()
  };
  outcomes.push(out);
  writeJsonAtomic(filePath(ws, 'outcomes'), outcomes);
  return out;
}

function listSchedules(workspace) {
  ensureWorkspace(workspace);
  return readJson(filePath(workspace, 'schedules'), []);
}

function addSchedule(workspace, input) {
  const ws = ensureWorkspace(workspace);
  const schedules = listSchedules(ws);
  const item = {
    id: genId('schedule'),
    name: String(input?.name || 'schedule'),
    workflow: String(input?.workflow || 'morning_ops'),
    runAt: String(input?.runAt || new Date().toISOString()),
    repeat: String(input?.repeat || 'none'),
    enabled: input?.enabled !== false,
    payload: input?.payload && typeof input.payload === 'object' ? input.payload : {},
    lastRunAt: null,
    lastRunStatus: '',
    createdAt: new Date().toISOString()
  };
  schedules.push(item);
  writeJsonAtomic(filePath(ws, 'schedules'), schedules);
  return item;
}

function updateSchedule(workspace, scheduleId, patch) {
  const ws = ensureWorkspace(workspace);
  const schedules = listSchedules(ws);
  const idx = schedules.findIndex((x) => x.id === scheduleId);
  if (idx < 0) throw new Error(`Schedule not found: ${scheduleId}`);
  schedules[idx] = { ...schedules[idx], ...patch };
  writeJsonAtomic(filePath(ws, 'schedules'), schedules);
  return schedules[idx];
}

function removeSchedule(workspace, scheduleId) {
  const ws = ensureWorkspace(workspace);
  const schedules = listSchedules(ws);
  const next = schedules.filter((x) => x.id !== scheduleId);
  if (next.length === schedules.length) throw new Error(`Schedule not found: ${scheduleId}`);
  writeJsonAtomic(filePath(ws, 'schedules'), next);
}

function listDueSchedules(workspace, now = new Date()) {
  return listSchedules(workspace)
    .filter((x) => x.enabled)
    .filter((x) => {
      const ts = Date.parse(x.runAt);
      if (Number.isNaN(ts)) return false;
      return ts <= now.getTime();
    });
}

function getPolicy(workspace) {
  ensureWorkspace(workspace);
  const policy = readJson(filePath(workspace, 'policy'), DEFAULT_POLICY);
  return { ...DEFAULT_POLICY, ...(policy || {}) };
}

function setPolicy(workspace, patch) {
  const ws = ensureWorkspace(workspace);
  const current = getPolicy(ws);
  const next = { ...current, ...(patch || {}) };
  writeJsonAtomic(filePath(ws, 'policy'), next);
  return next;
}

function getState(workspace) {
  ensureWorkspace(workspace);
  const state = readJson(filePath(workspace, 'state'), DEFAULT_STATE);
  return { ...DEFAULT_STATE, ...(state || {}) };
}

function setState(workspace, patch) {
  const ws = ensureWorkspace(workspace);
  const current = getState(ws);
  const next = { ...current, ...(patch || {}) };
  writeJsonAtomic(filePath(ws, 'state'), next);
  return next;
}

function getIntegrations(workspace) {
  ensureWorkspace(workspace);
  const val = readJson(filePath(workspace, 'integrations'), DEFAULT_INTEGRATIONS);
  return { ...DEFAULT_INTEGRATIONS, ...(val || {}) };
}

function setIntegrations(workspace, patch) {
  const ws = ensureWorkspace(workspace);
  const current = getIntegrations(ws);
  const next = { ...current, ...(patch || {}) };
  writeJsonAtomic(filePath(ws, 'integrations'), next);
  return next;
}

function getRoles() {
  ensureDir(opsRoot());
  const roles = readJson(rolesPath(), { users: {} });
  return roles && typeof roles === 'object' ? roles : { users: {} };
}

function setRole({ workspace, user, role }) {
  const ws = workspace ? sanitizeWorkspace(workspace) : '';
  const u = String(user || '').trim();
  if (!u) throw new Error('User is required.');
  const r = String(role || '').trim();
  if (!r) throw new Error('Role is required.');
  const roles = getRoles();
  roles.users[u] = roles.users[u] || { globalRole: 'owner', workspaces: {} };
  if (ws) {
    roles.users[u].workspaces[ws] = r;
  } else {
    roles.users[u].globalRole = r;
  }
  writeJsonAtomic(rolesPath(), roles);
  return roles.users[u];
}

function getRole({ workspace, user }) {
  const ws = workspace ? sanitizeWorkspace(workspace) : '';
  const u = String(user || '').trim();
  const roles = getRoles();
  const entry = roles.users[u];
  if (!entry) return 'owner';
  if (ws && entry.workspaces && entry.workspaces[ws]) return entry.workspaces[ws];
  return entry.globalRole || 'owner';
}

module.exports = {
  DEFAULT_POLICY,
  sanitizeWorkspace,
  opsRoot,
  ensureWorkspace,
  listLeads,
  addLead,
  updateLead,
  listAlerts,
  addAlert,
  ackAlert,
  listApprovals,
  addApproval,
  resolveApproval,
  listOutcomes,
  appendOutcome,
  listSchedules,
  addSchedule,
  updateSchedule,
  removeSchedule,
  listDueSchedules,
  getPolicy,
  setPolicy,
  getState,
  setState,
  getIntegrations,
  setIntegrations,
  getRoles,
  setRole,
  getRole
};
