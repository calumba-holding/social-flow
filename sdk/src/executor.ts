import type { MetaHttpExecutor, SocialConfig } from "./types.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function statusOf(value: unknown): number {
  return value && typeof value === "object"
    ? Number((value as { status?: number }).status) || 0
    : 0;
}

function metaCodeOf(value: unknown): number {
  const nested = value && typeof value === "object"
    ? (value as { error?: { code?: number } }).error
    : null;
  return nested && typeof nested === "object" ? Number(nested.code) || 0 : 0;
}

function networkCodeOf(value: unknown): string {
  return value && typeof value === "object"
    ? String((value as { code?: unknown }).code || "")
    : "";
}

function shouldRetry(value: unknown): boolean {
  const status = statusOf(value);
  const code = metaCodeOf(value);
  if (status === 429) return true;
  if (status >= 500 && status <= 599) return true;
  if (code === 613 || code === 17 || code === 32) return true;
  const networkCodes = new Set(["ECONNRESET", "ETIMEDOUT", "ECONNABORTED", "ENOTFOUND", "EAI_AGAIN"]);
  return networkCodes.has(networkCodeOf(value));
}

function retryDelayMs(attempt: number): number {
  const base = Number.parseInt(process.env.SOCIAL_META_RETRY_BASE_MS || "1000", 10) || 1000;
  const max = Number.parseInt(process.env.SOCIAL_META_RETRY_MAX_MS || "8000", 10) || 8000;
  const backoff = Math.min(max, base * Math.pow(2, attempt));
  const jitter = Math.floor(backoff * 0.3 * Math.random());
  return backoff + jitter;
}

function asPayloadError(value: unknown): unknown {
  const status = statusOf(value);
  const data = value && typeof value === "object"
    ? (value as { data?: unknown }).data
    : null;
  return {
    response: { status: status || 500, data: data ?? { error: { message: String(value || "Meta request failed.") } } }
  };
}

/**
 * Zero-dependency Meta Graph API executor. Uses Node's built-in fetch,
 * so the SDK has no runtime dependencies at all.
 */
export class MetaFetchExecutor implements MetaHttpExecutor {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: SocialConfig, fetchImpl?: typeof fetch) {
    this.token = config.token;
    this.baseUrl = `https://graph.facebook.com/${config.graphVersion}`;
    this.fetchImpl = fetchImpl || fetch;
    const parsed = Number.parseInt(process.env.SOCIAL_META_RETRY_MAX || "3", 10);
    this.maxRetries = Number.isFinite(parsed) ? Math.max(1, parsed) : 3;
  }

  private async requestWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      try {
        return await fn();
      } catch (error) {
        if (attempt < this.maxRetries - 1 && shouldRetry(error)) {
          await sleep(retryDelayMs(attempt));
          continue;
        }
        throw error;
      }
    }
    throw new Error("Unreachable");
  }

  async get(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
    return this.requestWithRetry(async () => {
      const search = new URLSearchParams({ ...params, access_token: this.token });
      const response = await this.fetchImpl(`${this.baseUrl}/${path}?${search.toString()}`);
      const data = await response.json().catch(() => null);
      if (!response.ok) throw asPayloadError({ status: response.status, data });
      return (data ?? {}) as Record<string, unknown>;
    });
  }

  async post(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
    return this.requestWithRetry(async () => {
      const body = new URLSearchParams({ ...params, access_token: this.token });
      const response = await this.fetchImpl(`${this.baseUrl}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString()
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw asPayloadError({ status: response.status, data });
      return (data ?? {}) as Record<string, unknown>;
    });
  }
}

export function createMetaExecutor(config: SocialConfig, fetchImpl?: typeof fetch): MetaHttpExecutor {
  return new MetaFetchExecutor(config, fetchImpl);
}
