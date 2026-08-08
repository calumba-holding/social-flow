import { access, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type {
  ChatTurn,
  ConfigSnapshot,
  HatchMemorySnapshot,
  MemoryIntentRecord,
  MemoryUnresolvedRecord,
  OpsCenterSnapshot,
  PersistedLog
} from "./tui-types.js";

type HatchMemoryScope = {
  profileId?: string;
  sessionId?: string;
};

type HatchSessionSnapshot = {
  sessionId: string;
  profileId: string;
  updatedAt: string;
  lastIntents: MemoryIntentRecord[];
  unresolved: MemoryUnresolvedRecord[];
  turns: ChatTurn[];
};

type HatchProfileSnapshot = {
  profileId: string;
  updatedAt: string;
  profileName: string;
  lastIntents: MemoryIntentRecord[];
  unresolved: MemoryUnresolvedRecord[];
};

type HatchMemoryIndex = {
  version: number;
  updatedAt: string;
  lastByProfile: Record<string, { sessionId: string; updatedAt: string }>;
};

function explicitAppHome(): string {
  return process.env.SOCIAL_FLOW_HOME ? path.resolve(process.env.SOCIAL_FLOW_HOME) : "";
}

function legacyHomeRoot(): string {
  if (process.env.SOCIAL_CLI_HOME) return path.resolve(process.env.SOCIAL_CLI_HOME);
  if (process.env.META_CLI_HOME) return path.resolve(process.env.META_CLI_HOME);
  return os.homedir();
}

function socialFlowDir(): string {
  const explicit = explicitAppHome();
  if (explicit) return explicit;
  return path.join(legacyHomeRoot(), ".social-flow");
}

function legacyAppDirs(): string[] {
  const current = socialFlowDir();
  const parent = path.dirname(current);
  const out = [
    path.join(parent, ".social-cli"),
    path.join(parent, ".meta-cli")
  ];
  const seen = new Set<string>();
  return out.filter((item) => {
    const key = process.platform === "win32" ? item.toLowerCase() : item;
    if (item === current || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function ensureMigratedAppHome(): Promise<void> {
  const current = socialFlowDir();
  if (await exists(current)) return;
  for (const legacy of legacyAppDirs()) {
    if (!(await exists(legacy))) continue;
    try {
      await mkdir(path.dirname(current), { recursive: true });
      await rename(legacy, current);
      return;
    } catch {
      // Legacy reads still work even if rename fails.
    }
  }
}

function socialFlowConfigCandidates(): string[] {
  const current = path.join(socialFlowDir(), "config.json");
  const out = [current];
  for (const legacy of legacyAppDirs()) {
    out.push(path.join(legacy, "config.json"));
  }
  return out;
}

function socialFlowDirLegacyAware(): string {
  return socialFlowDir();
}

function hatchRootDir(): string {
  return path.join(socialFlowDirLegacyAware(), "hatch");
}

function hatchLegacyMemoryFile(): string {
  return path.join(hatchRootDir(), "memory.json");
}

function hatchLegacyBackupFile(): string {
  return path.join(hatchRootDir(), "memory.legacy.json");
}

function hatchSessionsDir(): string {
  return path.join(hatchRootDir(), "sessions");
}

function hatchProfilesDir(): string {
  return path.join(hatchRootDir(), "profiles");
}

function hatchIndexFile(): string {
  return path.join(hatchRootDir(), "index.json");
}

function safeSegment(value: string, fallback: string): string {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
}

function normalizeProfileId(value: string): string {
  return safeSegment(value, "default");
}

function normalizeSessionId(value: string): string {
  return safeSegment(value, "hatch_default");
}

function hatchSessionFilePath(sessionId: string): string {
  return path.join(hatchSessionsDir(), `${normalizeSessionId(sessionId)}.json`);
}

function hatchProfileFilePath(profileId: string): string {
  return path.join(hatchProfilesDir(), `${normalizeProfileId(profileId)}.json`);
}

function defaultHatchIndex(): HatchMemoryIndex {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    lastByProfile: {}
  };
}

function normalizeIntentRecords(value: unknown): MemoryIntentRecord[] {
  return Array.isArray(value)
    ? value.map((x) => ({
      at: String((x as { at?: string })?.at || "").trim() || new Date().toISOString(),
      text: String((x as { text?: string })?.text || "").trim(),
      action: String((x as { action?: string })?.action || "").trim()
    })).filter((x) => x.text && x.action).slice(-3)
    : [];
}

function normalizeUnresolvedRecords(value: unknown): MemoryUnresolvedRecord[] {
  return Array.isArray(value)
    ? value.map((x) => ({
      at: String((x as { at?: string })?.at || "").trim() || new Date().toISOString(),
      text: String((x as { text?: string })?.text || "").trim(),
      reason: String((x as { reason?: string })?.reason || "").trim()
    })).filter((x) => x.text).slice(-6)
    : [];
}

function normalizeTurns(value: unknown): ChatTurn[] {
  return Array.isArray(value)
    ? value.map((x) => normalizeTurn(x)).filter((x): x is ChatTurn => Boolean(x)).slice(-80)
    : [];
}

function normalizeProfileSnapshot(value: unknown, profileIdFallback: string): HatchProfileSnapshot | null {
  const row = value && typeof value === "object" ? value as Partial<HatchProfileSnapshot> : null;
  if (!row) return null;
  return {
    profileId: normalizeProfileId(String(row.profileId || profileIdFallback)),
    updatedAt: String(row.updatedAt || "").trim() || new Date().toISOString(),
    profileName: String(row.profileName || "").trim(),
    lastIntents: normalizeIntentRecords(row.lastIntents),
    unresolved: normalizeUnresolvedRecords(row.unresolved)
  };
}

function normalizeSessionSnapshot(value: unknown, profileIdFallback: string): HatchSessionSnapshot | null {
  const row = value && typeof value === "object" ? value as Partial<HatchSessionSnapshot> : null;
  if (!row) return null;
  return {
    sessionId: normalizeSessionId(String(row.sessionId || "hatch_default")),
    profileId: normalizeProfileId(String(row.profileId || profileIdFallback)),
    updatedAt: String(row.updatedAt || "").trim() || new Date().toISOString(),
    lastIntents: normalizeIntentRecords(row.lastIntents),
    unresolved: normalizeUnresolvedRecords(row.unresolved),
    turns: normalizeTurns(row.turns)
  };
}

async function readHatchIndex(): Promise<HatchMemoryIndex> {
  const filePath = hatchIndexFile();
  if (!(await exists(filePath))) return defaultHatchIndex();
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<HatchMemoryIndex>;
    const out = defaultHatchIndex();
    out.version = Number(parsed.version || 1) || 1;
    out.updatedAt = String(parsed.updatedAt || out.updatedAt);
    const map = parsed.lastByProfile && typeof parsed.lastByProfile === "object"
      ? parsed.lastByProfile
      : {};
    for (const [profileId, row] of Object.entries(map)) {
      const data = row && typeof row === "object" ? row as { sessionId?: string; updatedAt?: string } : {};
      const normalizedProfile = normalizeProfileId(profileId);
      out.lastByProfile[normalizedProfile] = {
        sessionId: normalizeSessionId(String(data.sessionId || "")),
        updatedAt: String(data.updatedAt || "").trim() || out.updatedAt
      };
    }
    return out;
  } catch {
    return defaultHatchIndex();
  }
}

async function writeHatchIndex(index: HatchMemoryIndex): Promise<void> {
  const filePath = hatchIndexFile();
  await mkdir(path.dirname(filePath), { recursive: true });
  const payload: HatchMemoryIndex = {
    version: 1,
    updatedAt: String(index.updatedAt || "").trim() || new Date().toISOString(),
    lastByProfile: index.lastByProfile || {}
  };
  const tmpFile = `${filePath}.${process.pid}.tmp`;
  await writeFile(tmpFile, JSON.stringify(payload, null, 2), "utf8");
  await rename(tmpFile, filePath);
}

async function resolveProfileId(explicitProfileId?: string): Promise<string> {
  const direct = normalizeProfileId(String(explicitProfileId || ""));
  if (direct !== "default" || String(explicitProfileId || "").trim()) return direct;
  try {
    const cfg = await loadConfigSnapshot();
    return normalizeProfileId(String(cfg.activeProfile || "default"));
  } catch {
    return "default";
  }
}

async function readSessionSnapshot(sessionId: string, expectedProfileId: string): Promise<HatchSessionSnapshot | null> {
  const filePath = hatchSessionFilePath(sessionId);
  if (!(await exists(filePath))) return null;
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = normalizeSessionSnapshot(JSON.parse(raw), expectedProfileId);
    if (!parsed) return null;
    if (parsed.profileId !== normalizeProfileId(expectedProfileId)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function readProfileSnapshot(profileId: string): Promise<HatchProfileSnapshot | null> {
  const filePath = hatchProfileFilePath(profileId);
  if (!(await exists(filePath))) return null;
  try {
    const raw = await readFile(filePath, "utf8");
    return normalizeProfileSnapshot(JSON.parse(raw), profileId);
  } catch {
    return null;
  }
}

async function writeSessionSnapshot(snapshot: HatchSessionSnapshot): Promise<void> {
  const filePath = hatchSessionFilePath(snapshot.sessionId);
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmpFile = `${filePath}.${process.pid}.tmp`;
  await writeFile(tmpFile, JSON.stringify(snapshot, null, 2), "utf8");
  await rename(tmpFile, filePath);
}

async function writeProfileSnapshot(snapshot: HatchProfileSnapshot): Promise<void> {
  const filePath = hatchProfileFilePath(snapshot.profileId);
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmpFile = `${filePath}.${process.pid}.tmp`;
  await writeFile(tmpFile, JSON.stringify(snapshot, null, 2), "utf8");
  await rename(tmpFile, filePath);
}

async function migrateLegacyMemoryIfNeeded(profileId: string, index: HatchMemoryIndex): Promise<HatchMemoryIndex> {
  const legacyFile = hatchLegacyMemoryFile();
  if (!(await exists(legacyFile))) return index;

  const normalizedProfile = normalizeProfileId(profileId);
  const hasScopedData = Boolean(index.lastByProfile[normalizedProfile]?.sessionId) || await exists(hatchProfileFilePath(normalizedProfile));
  if (hasScopedData) return index;

  try {
    const raw = await readFile(legacyFile, "utf8");
    const parsed = JSON.parse(raw) as Partial<HatchMemorySnapshot>;
    const now = new Date().toISOString();
    const sessionId = normalizeSessionId(String(parsed.sessionId || "hatch_legacy"));
    const lastIntents = normalizeIntentRecords(parsed.lastIntents);
    const unresolved = normalizeUnresolvedRecords(parsed.unresolved);
    const turns = normalizeTurns(parsed.turns);

    await writeSessionSnapshot({
      sessionId,
      profileId: normalizedProfile,
      updatedAt: now,
      lastIntents,
      unresolved,
      turns
    });
    await writeProfileSnapshot({
      profileId: normalizedProfile,
      updatedAt: now,
      profileName: String(parsed.profileName || "").trim(),
      lastIntents,
      unresolved
    });

    const nextIndex: HatchMemoryIndex = {
      ...index,
      updatedAt: now,
      lastByProfile: {
        ...index.lastByProfile,
        [normalizedProfile]: { sessionId, updatedAt: now }
      }
    };
    await writeHatchIndex(nextIndex);

    const backupFile = hatchLegacyBackupFile();
    if (!(await exists(backupFile))) {
      await rename(legacyFile, backupFile);
    }
    return nextIndex;
  } catch {
    return index;
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveLogDir(): Promise<string> {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "logs"),
    path.join(cwd, "..", "logs"),
    path.join(cwd, "..", "..", "logs")
  ];
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return candidates[0];
}

function sanitizeWorkspaceName(name: string): string {
  const raw = String(name || "").trim();
  const trimmed = raw.startsWith("@") ? raw.slice(1) : raw;
  const safe = trimmed.replace(/[^a-zA-Z0-9._-]/g, "_");
  return safe || "default";
}

function opsRootCandidates(): string[] {
  const base = path.dirname(socialFlowDirLegacyAware());
  return [
    path.join(base, "ops"),
    path.join(process.cwd(), ".social-flow-ops"),
    path.join(process.cwd(), ".social-cli-ops")
  ];
}

async function resolveOpsRoot(): Promise<string> {
  const candidates = opsRootCandidates();
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return candidates[0];
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  if (!(await exists(filePath))) return fallback;
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function latestTimestamp(rows: Array<Record<string, unknown>>, keys: string[]): string {
  const fields = Array.isArray(keys) ? keys : [];
  let latest = "";
  let latestTs = 0;
  rows.forEach((row) => {
    fields.forEach((field) => {
      const raw = String(row?.[field] || "").trim();
      if (!raw) return;
      const ts = Date.parse(raw);
      if (Number.isFinite(ts) && ts > latestTs) {
        latestTs = ts;
        latest = raw;
      }
    });
  });
  return latest;
}

function deriveNextOpsAction(approvalsOpen: number, alertsOpen: number, lastMorningRunDate: string): string {
  if (approvalsOpen > 0) return "Review approvals";
  if (alertsOpen > 0) return "Review alerts";
  if (!lastMorningRunDate) return "Run morning check";
  return "All clear";
}

export async function loadConfigSnapshot(): Promise<ConfigSnapshot> {
  await ensureMigratedAppHome();
  let raw = "";
  for (const candidate of socialFlowConfigCandidates()) {
    if (!(await exists(candidate))) continue;
    raw = await readFile(candidate, "utf8");
    if (raw) break;
  }
  if (!raw) {
    throw new Error(`Config file not found under ${socialFlowDir()}`);
  }
  const parsed = JSON.parse(raw) as {
    activeProfile?: string;
    profiles?: Record<string, {
      apiVersion?: string;
      tokens?: {
        facebook?: string;
        instagram?: string;
        whatsapp?: string;
      };
      integrations?: {
        waba?: {
          connected?: boolean;
          businessId?: string;
          wabaId?: string;
          phoneNumberId?: string;
          webhookCallbackUrl?: string;
          webhookVerifyToken?: string;
        };
      };
      defaults?: {
        facebookPageId?: string;
        marketingAdAccountId?: string;
      };
      region?: {
        country?: string;
        timezone?: string;
      };
      industry?: {
        mode?: string;
        selected?: string;
        source?: string;
        confidence?: number;
        manualLocked?: boolean;
      };
      scopes?: string[];
    }>;
    token?: string;
    tokens?: {
      facebook?: string;
      instagram?: string;
      whatsapp?: string;
    };
    integrations?: {
      waba?: {
        connected?: boolean;
        businessId?: string;
        wabaId?: string;
        phoneNumberId?: string;
        webhookCallbackUrl?: string;
        webhookVerifyToken?: string;
      };
    };
    graphVersion?: string;
    scopes?: string[];
    defaultPageId?: string;
    defaultAdAccountId?: string;
    industry?: {
      mode?: string;
      selected?: string;
      source?: string;
      confidence?: number;
      manualLocked?: boolean;
    };
  };

  const activeProfile = String(parsed?.activeProfile || "default").trim() || "default";
  const profileDoc = parsed?.profiles && typeof parsed.profiles === "object"
    ? parsed.profiles[activeProfile]
    : undefined;

  const profileTokens = profileDoc?.tokens || {};
  const flatTokens = parsed?.tokens || {};
  const tokenMap = {
    facebook: !!profileTokens.facebook || !!flatTokens.facebook || !!parsed?.token,
    instagram: !!profileTokens.instagram || !!flatTokens.instagram,
    whatsapp: !!profileTokens.whatsapp || !!flatTokens.whatsapp
  };

  const profileIndustry = profileDoc?.industry || parsed?.industry || {};
  const profileDefaults = profileDoc?.defaults || {};
  const profileIntegrations = profileDoc?.integrations || {};
  const flatIntegrations = parsed?.integrations || {};
  const waba = (profileIntegrations.waba || flatIntegrations.waba || {}) as {
    connected?: boolean;
    businessId?: string;
    wabaId?: string;
    phoneNumberId?: string;
    webhookCallbackUrl?: string;
    webhookVerifyToken?: string;
  };
  const graphVersion = profileDoc?.apiVersion || parsed?.graphVersion || "v26.0";
  const scopes = Array.isArray(profileDoc?.scopes)
    ? profileDoc.scopes.map((x) => String(x))
    : Array.isArray(parsed?.scopes)
      ? parsed.scopes.map((x) => String(x))
      : [];

  const profilesMap = parsed?.profiles && typeof parsed.profiles === "object" ? parsed.profiles : {};
  const profileNames = Object.keys(profilesMap);
  if (!profileNames.includes(activeProfile)) profileNames.unshift(activeProfile);
  const profiles = profileNames.map((name) => {
    const doc = profilesMap[name] || {};
    const docTokens = doc.tokens || {};
    const docIntegrations = doc.integrations || {};
    const isActive = name === activeProfile;
    const mergedTokens = isActive
      ? {
        facebook: docTokens.facebook || flatTokens.facebook || parsed?.token,
        instagram: docTokens.instagram || flatTokens.instagram,
        whatsapp: docTokens.whatsapp || flatTokens.whatsapp
      }
      : docTokens;
    const mergedWaba = isActive
      ? (docIntegrations.waba || flatIntegrations.waba || {})
      : (docIntegrations.waba || {});
    const hasToken = Boolean(mergedTokens.facebook || mergedTokens.instagram || mergedTokens.whatsapp);
    return {
      name,
      tokenSet: hasToken,
      whatsappToken: Boolean(mergedTokens.whatsapp),
      wabaConnected: Boolean(mergedWaba.connected),
      phoneNumberId: Boolean(mergedWaba.phoneNumberId)
    };
  });

  return {
    activeProfile,
    tokenSet: tokenMap.facebook || tokenMap.instagram || tokenMap.whatsapp,
    graphVersion,
    scopes,
    tokenMap,
    defaultPageId: String(profileDefaults.facebookPageId || parsed.defaultPageId || "").trim() || undefined,
    defaultAdAccountId: String(profileDefaults.marketingAdAccountId || parsed.defaultAdAccountId || "").trim() || undefined,
    industry: {
      mode: String(profileIndustry.mode || "hybrid"),
      selected: String(profileIndustry.selected || ""),
      source: String(profileIndustry.source || ""),
      confidence: Number(profileIndustry.confidence || 0) || 0,
      manualLocked: Boolean(profileIndustry.manualLocked)
    },
    waba: {
      connected: Boolean(waba.connected),
      businessId: String(waba.businessId || ""),
      wabaId: String(waba.wabaId || ""),
      phoneNumberId: String(waba.phoneNumberId || ""),
      webhookCallbackUrl: String(waba.webhookCallbackUrl || ""),
      webhookVerifyToken: String(waba.webhookVerifyToken || "")
    },
    profiles
  };
}

export async function loadOpsSnapshot(workspaces: string[], activeWorkspace: string): Promise<OpsCenterSnapshot> {
  const root = await resolveOpsRoot();
  const unique = Array.from(new Set(
    (Array.isArray(workspaces) ? workspaces : [])
      .map((x) => String(x || "").trim())
      .filter(Boolean)
  ));
  const fallback = activeWorkspace ? [activeWorkspace] : ["default"];
  const targets = unique.length ? unique : fallback;

  const rows = await Promise.all(targets.map(async (name) => {
    const dir = path.join(root, sanitizeWorkspaceName(name));
    const approvals = await readJsonFile<Array<{ status?: string }>>(path.join(dir, "approvals.json"), []);
    const alerts = await readJsonFile<Array<{ status?: string }>>(path.join(dir, "alerts.json"), []);
    const actions = await readJsonFile<Array<Record<string, unknown>>>(path.join(dir, "actionLog.json"), []);
    const outcomes = await readJsonFile<Array<Record<string, unknown>>>(path.join(dir, "outcomes.json"), []);
    const state = await readJsonFile<Record<string, unknown>>(path.join(dir, "state.json"), {});

    const approvalsOpen = approvals.filter((a) => String(a?.status || "") === "pending").length;
    const alertsOpen = alerts.filter((a) => String(a?.status || "") === "open").length;
    const lastActionAt = latestTimestamp(actions, ["when", "createdAt", "timestamp"]);
    const lastOutcomeAt = latestTimestamp(outcomes, ["createdAt"]);
    const lastActivity = latestTimestamp(
      [{ at: lastActionAt }, { at: lastOutcomeAt }],
      ["at"]
    );
    const lastMorningRunDate = String(state?.lastMorningRunDate || "").trim();

    return {
      name,
      approvalsOpen,
      alertsOpen,
      lastMorningRunDate,
      lastActivity,
      nextAction: deriveNextOpsAction(approvalsOpen, alertsOpen, lastMorningRunDate)
    };
  }));

  return {
    activeWorkspace: String(activeWorkspace || "default").trim() || "default",
    workspaces: rows
  };
}

export async function loadPersistedLogs(): Promise<PersistedLog[]> {
  const logDir = await resolveLogDir();
  if (!(await exists(logDir))) return [];

  const files = (await readdir(logDir)).filter((x) => x.endsWith(".json"));
  const logs: PersistedLog[] = [];
  for (const file of files) {
    try {
      const raw = await readFile(path.join(logDir, file), "utf8");
      const parsed = JSON.parse(raw) as PersistedLog;
      if (parsed && parsed.id && parsed.timestamp) logs.push(parsed);
    } catch {}
  }
  logs.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  return logs.slice(0, 50);
}

export function replayInputFromLog(log: PersistedLog): string | null {
  const action = String(log.action || "");
  if (action === "get:profile") return "get my facebook profile";
  if (action === "list:ads") {
    const adAccount = log.params?.adAccountId || "";
    return adAccount ? `list ads account ${adAccount}` : "list ads";
  }
  if (action === "create:post") {
    const message = log.params?.message || "";
    if (!message) return null;
    const pageId = log.params?.pageId || "";
    return pageId ? `create post "${message}" page ${pageId}` : `create post "${message}"`;
  }
  return null;
}

export function accountOptionsFromConfig(config: ConfigSnapshot): Array<{ label: string; value: string }> {
  const out: Array<{ label: string; value: string }> = [{ label: "default", value: "default" }];
  if (config.defaultPageId) out.push({ label: `page:${config.defaultPageId}`, value: `page:${config.defaultPageId}` });
  if (config.defaultAdAccountId) out.push({ label: `ad:${config.defaultAdAccountId}`, value: `ad:${config.defaultAdAccountId}` });
  return out;
}

function normalizeTurn(value: unknown): ChatTurn | null {
  const row = value && typeof value === "object" ? value as Partial<ChatTurn> : null;
  if (!row) return null;
  const role = row.role === "assistant" || row.role === "user" || row.role === "system" ? row.role : "system";
  const text = String(row.text || "").trim();
  if (!text) return null;
  const at = String(row.at || "").trim() || new Date().toISOString();
  const id = String(row.id || "").trim() || `turn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  return { id, at, role, text };
}

export async function loadHatchMemory(scope: HatchMemoryScope = {}): Promise<HatchMemorySnapshot | null> {
  await ensureMigratedAppHome();
  const profileId = await resolveProfileId(scope.profileId);
  let index = await readHatchIndex();
  index = await migrateLegacyMemoryIfNeeded(profileId, index);

  const requestedSessionId = String(scope.sessionId || "").trim();
  const indexedSessionId = String(index.lastByProfile[profileId]?.sessionId || "").trim();
  const sessionId = normalizeSessionId(requestedSessionId || indexedSessionId || "hatch_default");

  const [sessionDoc, profileDoc] = await Promise.all([
    readSessionSnapshot(sessionId, profileId),
    readProfileSnapshot(profileId)
  ]);
  if (!sessionDoc && !profileDoc) return null;

  const updatedAt = sessionDoc?.updatedAt || profileDoc?.updatedAt || new Date().toISOString();
  const profileName = String(profileDoc?.profileName || "").trim();
  const turns = sessionDoc?.turns || [];
  const lastIntents = sessionDoc?.lastIntents?.length
    ? sessionDoc.lastIntents
    : profileDoc?.lastIntents || [];
  const unresolved = sessionDoc?.unresolved?.length
    ? sessionDoc.unresolved
    : profileDoc?.unresolved || [];

  return {
    sessionId: sessionDoc?.sessionId || sessionId,
    updatedAt,
    profileName,
    lastIntents,
    unresolved,
    turns
  };
}

export async function saveHatchMemory(
  snapshot: Omit<HatchMemorySnapshot, "updatedAt">,
  scope: HatchMemoryScope = {}
): Promise<void> {
  await ensureMigratedAppHome();
  const profileId = await resolveProfileId(scope.profileId);
  const sessionId = normalizeSessionId(String(scope.sessionId || snapshot.sessionId || "hatch_default"));
  const updatedAt = new Date().toISOString();

  await writeSessionSnapshot({
    sessionId,
    profileId,
    updatedAt,
    lastIntents: normalizeIntentRecords(snapshot.lastIntents),
    unresolved: normalizeUnresolvedRecords(snapshot.unresolved),
    turns: normalizeTurns(snapshot.turns)
  });
  await writeProfileSnapshot({
    profileId,
    updatedAt,
    profileName: String(snapshot.profileName || "").trim(),
    lastIntents: normalizeIntentRecords(snapshot.lastIntents),
    unresolved: normalizeUnresolvedRecords(snapshot.unresolved)
  });

  const index = await readHatchIndex();
  index.updatedAt = updatedAt;
  index.lastByProfile[profileId] = { sessionId, updatedAt };
  await writeHatchIndex(index);
}
