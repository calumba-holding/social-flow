const keyInput = document.getElementById('api-key');
const saveKeyBtn = document.getElementById('save-key-btn');
const refreshBtn = document.getElementById('refresh-btn');
const gatewayPill = document.getElementById('gateway-pill');
const workspacePill = document.getElementById('workspace-pill');

const serviceName = document.getElementById('service-name');
const serviceVersion = document.getElementById('service-version');
const serviceNow = document.getElementById('service-now');

const tokenFacebook = document.getElementById('token-facebook');
const tokenInstagram = document.getElementById('token-instagram');
const tokenWhatsapp = document.getElementById('token-whatsapp');
const appSecret = document.getElementById('app-secret');
const opsSnapshot = document.getElementById('ops-snapshot');
const profilesList = document.getElementById('profiles-list');

const STORAGE_KEY = 'social_studio_gateway_key';

function setGatewayPill(text, ok) {
  gatewayPill.textContent = text;
  gatewayPill.classList.toggle('ok', Boolean(ok));
}

function getStoredApiKey() {
  try {
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function setStoredApiKey(value) {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, value);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // non-blocking on strict browser privacy mode
  }
}

function toHeaders() {
  const key = String(keyInput.value || '').trim();
  if (!key) return {};
  return { 'x-gateway-key': key };
}

function boolFlag(v) {
  return v ? 'configured' : 'missing';
}

function fmtDate(iso) {
  const d = new Date(String(iso || ''));
  if (!Number.isFinite(d.getTime())) return '--';
  return d.toLocaleString();
}

async function fetchJson(url, headers) {
  const res = await fetch(url, {
    method: 'GET',
    headers: headers || {}
  });
  const raw = await res.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = {};
  }
  return { ok: res.ok, status: res.status, data };
}

function renderStatus(statusData) {
  const cfg = statusData?.config || {};
  const tokens = cfg.tokens || {};
  const profiles = Array.isArray(cfg.profiles) ? cfg.profiles : [];

  serviceName.textContent = String(statusData?.service || '--');
  serviceVersion.textContent = String(statusData?.version || '--');
  serviceNow.textContent = fmtDate(statusData?.now || '');
  workspacePill.textContent = `Workspace: ${String(statusData?.workspace || cfg.activeProfile || 'default')}`;

  tokenFacebook.textContent = `Facebook token: ${boolFlag(tokens.facebook?.configured)}`;
  tokenInstagram.textContent = `Instagram token: ${boolFlag(tokens.instagram?.configured)}`;
  tokenWhatsapp.textContent = `WhatsApp token: ${boolFlag(tokens.whatsapp?.configured)}`;
  appSecret.textContent = `App secret: ${boolFlag(cfg.app?.appSecretConfigured)}`;

  profilesList.innerHTML = '';
  if (!profiles.length) {
    const li = document.createElement('li');
    li.textContent = 'No named profiles yet. You are using `default`.';
    profilesList.appendChild(li);
    return;
  }
  profiles.forEach((name) => {
    const li = document.createElement('li');
    li.textContent = String(name);
    profilesList.appendChild(li);
  });
}

function renderOps(summary, errorText) {
  opsSnapshot.innerHTML = '';
  if (summary && typeof summary === 'object') {
    const rows = [
      `Workspace: ${String(summary.workspace || 'default')}`,
      `Open alerts: ${Number(summary.alertsOpen || 0)}`,
      `Pending approvals: ${Number(summary.approvalsPending || 0)}`,
      `Guard mode: ${String(summary.guardPolicy?.mode || 'approval')}`,
      `Sources: ${Number(summary.sources || 0)}`
    ];
    rows.forEach((label) => {
      const li = document.createElement('li');
      li.textContent = label;
      opsSnapshot.appendChild(li);
    });
    return;
  }

  const li = document.createElement('li');
  li.textContent = errorText || 'Ops summary unavailable.';
  opsSnapshot.appendChild(li);
}

async function refresh() {
  setGatewayPill('Gateway: checking...', false);
  const headers = toHeaders();

  const [health, status] = await Promise.all([
    fetchJson('/api/health', headers),
    fetchJson('/api/status', headers)
  ]);

  if (health.ok && health.data && health.data.ok) {
    setGatewayPill('Gateway: healthy', true);
  } else {
    setGatewayPill(`Gateway: error (${health.status})`, false);
  }

  if (status.ok && status.data && status.data.ok) {
    renderStatus(status.data);
  } else {
    renderStatus({});
    if (status.status === 401) {
      workspacePill.textContent = 'Workspace: auth required';
      profilesList.innerHTML = '<li>Set gateway key and refresh.</li>';
    }
  }

  const ws = String(status?.data?.workspace || status?.data?.config?.activeProfile || 'default');
  const ops = await fetchJson(`/api/ops/summary?workspace=${encodeURIComponent(ws)}`, headers);
  if (ops.ok && ops.data && ops.data.ok) {
    renderOps(ops.data.summary);
  } else if (ops.status === 401) {
    renderOps(null, 'Unauthorized. Add x-gateway-key above.');
  } else if (ops.status === 400) {
    renderOps(null, String(ops.data?.error || 'Permission denied for this operator.'));
  } else {
    renderOps(null, 'Ops summary unavailable on this gateway profile.');
  }
}

keyInput.value = getStoredApiKey();
saveKeyBtn.addEventListener('click', () => {
  setStoredApiKey(String(keyInput.value || '').trim());
});
refreshBtn.addEventListener('click', () => {
  refresh().catch(() => {
    setGatewayPill('Gateway: failed to refresh', false);
  });
});

refresh().catch(() => {
  setGatewayPill('Gateway: failed to connect', false);
});
