import { access, readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { ConfigSnapshot, PersistedLog } from "./tui-types.js";

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

export async function loadConfigSnapshot(): Promise<ConfigSnapshot> {
  const cfgPath = path.join(os.homedir(), ".social-cli", "config.json");
  const raw = await readFile(cfgPath, "utf8");
  const parsed = JSON.parse(raw) as {
    token?: string;
    tokens?: {
      facebook?: string;
      instagram?: string;
      whatsapp?: string;
    };
    graphVersion?: string;
    scopes?: string[];
    defaultPageId?: string;
    defaultAdAccountId?: string;
  };
  const tokenMap = {
    facebook: !!parsed?.tokens?.facebook || !!parsed?.token,
    instagram: !!parsed?.tokens?.instagram,
    whatsapp: !!parsed?.tokens?.whatsapp
  };
  return {
    tokenSet: tokenMap.facebook || tokenMap.instagram || tokenMap.whatsapp,
    graphVersion: parsed.graphVersion || "v20.0",
    scopes: Array.isArray(parsed.scopes) ? parsed.scopes.map((x) => String(x)) : [],
    tokenMap,
    defaultPageId: parsed.defaultPageId,
    defaultAdAccountId: parsed.defaultAdAccountId
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

