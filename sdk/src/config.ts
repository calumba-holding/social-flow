import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

import type { SocialConfig } from "./types.js";

export interface SdkStoreShape {
  token?: string;
  graphVersion?: string;
  scopes?: string[];
  defaultPageId?: string;
  defaultAdAccountId?: string;
  defaultWhatsAppNumberId?: string;
}

function envConfigPath(): string {
  return String(process.env.SOCIAL_SDK_CONFIG_PATH || "").trim();
}

function defaultConfigPath(): string {
  return join(homedir(), ".social-flow-sdk", "config.json");
}

function safeReadJson(filePath: string): Record<string, unknown> {
  try {
    if (!existsSync(filePath)) return {};
    return JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function maskToken(token: string | undefined): string {
  const value = String(token || "").trim();
  if (!value) return "";
  if (value.length <= 8) return "•".repeat(value.length);
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

/**
 * Persistent config store for the standalone SDK. Reads env vars as
 * defaults, then overlays a JSON file (default ~/.social-flow-sdk/config.json).
 * No gateway key is ever required; the Meta token is optional until the
 * user pushes to Meta Ads.
 */
export class SdkConfigStore {
  private readonly filePath: string;
  private readonly data: SdkStoreShape;

  constructor(path?: string) {
    this.filePath = envConfigPath() || path || defaultConfigPath();
    const fileData = safeReadJson(this.filePath) as SdkStoreShape;
    this.data = {
      token: firstNonEmpty(
        fileData.token,
        process.env.SOCIAL_META_TOKEN,
        process.env.META_TOKEN,
        ""
      ),
      graphVersion: firstNonEmpty(
        fileData.graphVersion,
        process.env.SOCIAL_META_GRAPH_VERSION,
        "v26.0"
      ),
      scopes: Array.isArray(fileData.scopes) ? fileData.scopes : [],
      defaultPageId: firstNonEmpty(
        fileData.defaultPageId,
        process.env.SOCIAL_DEFAULT_PAGE_ID,
        process.env.META_PAGE_ID,
        ""
      ),
      defaultAdAccountId: firstNonEmpty(
        fileData.defaultAdAccountId,
        process.env.SOCIAL_DEFAULT_AD_ACCOUNT_ID,
        process.env.META_AD_ACCOUNT_ID,
        ""
      ),
      defaultWhatsAppNumberId: firstNonEmpty(
        fileData.defaultWhatsAppNumberId,
        process.env.SOCIAL_DEFAULT_WHATSAPP_NUMBER_ID,
        ""
      )
    };
  }

  get configPath(): string {
    return this.filePath;
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, `${JSON.stringify(this.data, null, 2)}\n`, "utf8");
    } catch {
      // Ignore persistence failures; in-memory config still works.
    }
  }

  asSocialConfig(): SocialConfig {
    return {
      token: String(this.data.token || "").trim(),
      graphVersion: String(this.data.graphVersion || "v26.0").trim(),
      scopes: Array.isArray(this.data.scopes) ? this.data.scopes : [],
      defaultPageId: String(this.data.defaultPageId || "").trim(),
      defaultAdAccountId: String(this.data.defaultAdAccountId || "").trim(),
      defaultWhatsAppNumberId: String(this.data.defaultWhatsAppNumberId || "").trim()
    };
  }

  get token(): string {
    return String(this.data.token || "").trim();
  }

  get hasToken(): boolean {
    return Boolean(this.token);
  }

  get graphVersion(): string {
    return String(this.data.graphVersion || "v26.0").trim();
  }

  get defaultPageId(): string {
    return String(this.data.defaultPageId || "").trim();
  }

  get defaultAdAccountId(): string {
    return String(this.data.defaultAdAccountId || "").trim();
  }

  get defaultWhatsAppNumberId(): string {
    return String(this.data.defaultWhatsAppNumberId || "").trim();
  }

  setToken(token: string): void {
    this.data.token = String(token || "").trim();
    this.persist();
  }

  setDefaults(updates: { pageId?: string; adAccountId?: string; whatsAppNumberId?: string }): void {
    if (updates.pageId !== undefined) this.data.defaultPageId = String(updates.pageId || "").trim();
    if (updates.adAccountId !== undefined) this.data.defaultAdAccountId = String(updates.adAccountId || "").trim();
    if (updates.whatsAppNumberId !== undefined) {
      this.data.defaultWhatsAppNumberId = String(updates.whatsAppNumberId || "").trim();
    }
    this.persist();
  }

  setGraphVersion(version: string): void {
    const value = String(version || "").trim();
    this.data.graphVersion = value || "v26.0";
    this.persist();
  }
}

function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    const cleaned = String(value || "").trim();
    if (cleaned) return cleaned;
  }
  return "";
}

export { resolve, safeReadJson };
