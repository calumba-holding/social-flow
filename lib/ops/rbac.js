const storage = require('./storage');

const ROLE_ORDER = ['viewer', 'analyst', 'operator', 'owner'];

const PERMISSIONS = {
  viewer: new Set(['read']),
  analyst: new Set(['read', 'write']),
  operator: new Set(['read', 'write', 'approve', 'execute']),
  owner: new Set(['read', 'write', 'approve', 'execute', 'admin'])
};

function normalizeRole(role) {
  const r = String(role || '').trim().toLowerCase();
  if (ROLE_ORDER.includes(r)) return r;
  return 'viewer';
}

function currentUser() {
  return String(
    process.env.SOCIAL_USER ||
    process.env.USER ||
    process.env.USERNAME ||
    'local-user'
  ).trim();
}

function roleFor({ workspace, user }) {
  return normalizeRole(storage.getRole({ workspace, user: user || currentUser() }));
}

function can(role, action) {
  const r = normalizeRole(role);
  return PERMISSIONS[r].has(action);
}

function assertCan({ workspace, action, user }) {
  const r = roleFor({ workspace, user });
  if (!can(r, action)) {
    throw new Error(`Permission denied for action "${action}". Current role: ${r}`);
  }
  return r;
}

function roleChoices() {
  return [...ROLE_ORDER];
}

module.exports = {
  normalizeRole,
  currentUser,
  roleFor,
  can,
  assertCan,
  roleChoices
};

