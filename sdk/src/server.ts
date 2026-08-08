import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createMetaExecutor } from "./executor.js";
import { SdkConfigStore, maskToken } from "./config.js";
import * as realtorBrief from "./realtor/brief.js";
import * as realtorCompliance from "./realtor/compliance.js";
import * as realtorCampaign from "./realtor/campaign.js";
import * as realtorReport from "./realtor/report.js";
import * as realtorLeadForms from "./realtor/leadforms.js";
import * as realtorCapi from "./realtor/capi.js";
import type {
  BuildOptions,
  CampaignContext,
  RealtorDestination
} from "./realtor/campaign.js";
import type { RealtorBrief } from "./realtor/brief.js";
import type { CapiEvent, CapiEventName } from "./realtor/capi.js";
import type { MetaHttpExecutor, SocialConfig } from "./types.js";

export interface SdkServerOptions {
  port?: number;
  host?: string;
  configPath?: string;
  studioDir?: string;
  fetchImpl?: typeof fetch;
}

const SDK_APPROVAL_TTL_MS = 10 * 60 * 1000;

const SDK_ACTION_RISK: Record<string, string> = {
  status: "LOW",
  doctor: "LOW",
  get_profile: "LOW",
  create_post: "MEDIUM",
  list_ads: "LOW",
  send_whatsapp: "MEDIUM",
  logs: "LOW",
  replay: "HIGH",
  realtor_scopes: "LOW",
  realtor_build: "LOW",
  realtor_preview: "LOW",
  realtor_report: "LOW",
  realtor_leads: "LOW",
  realtor_leadform: "MEDIUM",
  realtor_capi: "MEDIUM",
  realtor_create_campaign: "HIGH"
};

function mimeFor(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  return "text/plain; charset=utf-8";
}

function sdkTraceId(): string {
  return `sdk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sortedJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((x) => sortedJson(x));
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  Object.keys(value).sort().forEach((key) => {
    out[key] = sortedJson(value[key]);
  });
  return out;
}

function sdkParamsHash(params: unknown): string {
  const normalized = sortedJson(isPlainObject(params) ? params : {});
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function normalizeSdkAction(value: unknown): string {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  return Object.prototype.hasOwnProperty.call(SDK_ACTION_RISK, raw) ? raw : "";
}

function sdkRiskForAction(action: string): string {
  const a = normalizeSdkAction(action);
  return a ? SDK_ACTION_RISK[a] : "";
}

function sdkRequiresApproval(action: string): boolean {
  const risk = sdkRiskForAction(action);
  return risk === "MEDIUM" || risk === "HIGH";
}

function sdkMeta({ action = "", risk = "", requiresApproval = false, approvalToken = "", approvalTokenExpiresAt = "", source = "sdk-server" }: Record<string, unknown> = {}) {
  return {
    action: String(action || "").trim(),
    risk: String(risk || "").trim(),
    requiresApproval: Boolean(requiresApproval),
    approvalToken: String(approvalToken || "").trim() || null,
    approvalTokenExpiresAt: String(approvalTokenExpiresAt || "").trim() || null,
    source: String(source || "sdk-server").trim() || "sdk-server"
  };
}

function sdkEnvelopeOk({ traceId, data = {}, action = "", risk = "", requiresApproval = false, approvalToken = "", approvalTokenExpiresAt = "" }: Record<string, unknown> = {}) {
  return {
    ok: true,
    traceId: String(traceId || sdkTraceId()),
    data,
    error: null,
    meta: sdkMeta({ action, risk, requiresApproval, approvalToken, approvalTokenExpiresAt })
  };
}

function sdkEnvelopeError({ traceId, status = 400, action = "", risk = "", requiresApproval = false, approvalToken = "", approvalTokenExpiresAt = "", code = "BAD_REQUEST", message = "Request failed", retryable = false, suggestedNextCommand = "", details = null }: Record<string, unknown> = {}) {
  return {
    status: Number(status) || 400,
    payload: {
      ok: false,
      traceId: String(traceId || sdkTraceId()),
      data: null,
      error: {
        code: String(code || "BAD_REQUEST").trim() || "BAD_REQUEST",
        message: String(message || "Request failed").trim() || "Request failed",
        retryable: Boolean(retryable),
        suggestedNextCommand: String(suggestedNextCommand || "").trim(),
        details: details && typeof details === "object" ? details : undefined
      },
      meta: sdkMeta({ action, risk, requiresApproval, approvalToken, approvalTokenExpiresAt })
    }
  };
}

function sdkErrorFromThrown(error: unknown, fallback: Record<string, unknown> = {}): { status: number; payload: Record<string, unknown> } {
  const err = error as { response?: { status?: number; data?: { error?: { message?: string; code?: unknown } } }; message?: string };
  const status = Number(err?.response?.status || 0);
  const apiError = err?.response?.data?.error || {};
  const message = String(apiError.message || err?.message || fallback.message || "Request failed").trim();
  const code = String(apiError.code || fallback.code || "EXECUTION_FAILED").trim() || "EXECUTION_FAILED";
  const retryable = status === 429 || (status >= 500 && status < 600);
  return sdkEnvelopeError({
    ...fallback,
    status: status || fallback.status || 400,
    code,
    message,
    retryable
  });
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      const size = chunks.reduce((n, b) => n + b.length, 0);
      if (size > 1024 * 1024) {
        reject(new Error("Request body too large."));
      }
    });
    req.on("error", reject);
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) return resolveBody({});
      try {
        const parsed = JSON.parse(raw);
        resolveBody(isPlainObject(parsed) ? parsed : {});
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
  });
}

function toBool(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null || value === "") return fallback;
  const s = String(value).toLowerCase().trim();
  if (["1", "true", "yes", "on"].includes(s)) return true;
  if (["0", "false", "no", "off"].includes(s)) return false;
  return fallback;
}

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseActId(input: unknown): string {
  const raw = String(input || "").trim();
  if (!raw) return "";
  return raw.startsWith("act_") ? raw : `act_${raw}`;
}

function parseScheduleToUnixSeconds(value: unknown): number | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Number(raw);
  const ts = Date.parse(raw);
  if (!Number.isFinite(ts)) return null;
  return Math.floor(ts / 1000);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function mask(value: string | undefined): string {
  return String(value || "").trim();
}

function realtorConfigLike(store: SdkConfigStore): SocialConfig {
  return store.asSocialConfig();
}

function realtorExecutorFromConfig(store: SdkConfigStore, fetchImpl?: typeof fetch): MetaHttpExecutor {
  return createMetaExecutor(store.asSocialConfig(), fetchImpl);
}

function realtorBriefFromBody(body: Record<string, unknown>): RealtorBrief {
  const text = String(body.text || "").trim();
  const parsed = text ? realtorBrief.parseBriefText(text) : {};
  const explicit = realtorBrief.briefFromOptions(isPlainObject(body.brief) ? body.brief : {});
  return realtorBrief.mergeBrief(parsed, explicit);
}

function realtorContextFromBrief(brief: RealtorBrief): CampaignContext {
  return {
    pageId: brief.pageId || "",
    adAccountId: brief.adAccountId || "",
    whatsappNumber: brief.whatsappNumber,
    leadFormId: brief.leadFormId,
    imageUrl: brief.image,
    city: brief.city,
    projectName: brief.projectName
  };
}

function realtorOptsFromBody(body: Record<string, unknown>, brief: RealtorBrief): BuildOptions {
  const opts: BuildOptions = {
    destination: (String(body.destination || brief.destination || "whatsapp")) as RealtorDestination,
    status: (String(body.status || "PAUSED")) as "PAUSED" | "ACTIVE",
    dailyBudgetInr: toNumber(body.dailyBudgetInr, brief.dailyBudget || 500)
  };
  if (body.advantageAudience === 1 || body.advantageAudience === "1") {
    opts.advantageAudience = 1;
  } else if (body.advantageAudience === 0 || body.advantageAudience === "0") {
    opts.advantageAudience = 0;
  }
  if (body.advantagePlusLeads === true || body.advantagePlusLeads === "true" || body.advantagePlusLeads === "1") {
    opts.advantagePlusLeads = true;
  }
  return opts;
}

function realtorLeadFormFromBody(body: Record<string, unknown>, brief: RealtorBrief) {
  const questions = Array.isArray(body.questions)
    ? body.questions
      .filter((q) => q && typeof q === "object" && (q as { type?: unknown }).type)
      .map((q) => {
        const row = q as { type?: unknown; key?: unknown; label?: unknown; options?: unknown };
        return {
          type: String(row.type).toUpperCase(),
          key: row.key !== undefined ? String(row.key) : undefined,
          label: row.label !== undefined ? String(row.label) : undefined,
          options: row.options !== undefined ? (row.options as string[]) : undefined
        };
      })
    : undefined;
  return {
    pageId: String(body.pageId || brief.pageId || "").trim(),
    name: String(body.name || "Realtor lead form").trim(),
    privacyPolicyUrl: String(body.privacyPolicyUrl || "").trim(),
    contextType: String(body.contextType || "PAGE").trim() || "PAGE",
    followUpActionUrl: String(body.followUpActionUrl || "").trim() || undefined,
    questions,
    optimizedForQuality: toBool(body.optimizedForQuality, false)
  };
}

function realtorCapiEventFromBody(body: Record<string, unknown>): CapiEvent {
  const userData = isPlainObject(body.userData) ? body.userData : {};
  return {
    eventName: (String(body.eventName || "Lead")) as CapiEventName,
    eventId: String(body.eventId || "").trim() || undefined,
    eventTime: toNumber(body.eventTime, 0),
    eventSourceUrl: String(body.eventSourceUrl || "").trim() || undefined,
    actionSource: (String(body.actionSource || "website").trim() || "website") as "website" | "lead" | "phone_call" | "conversation",
    userData,
    customData: isPlainObject(body.customData) ? body.customData : undefined
  };
}

function realtorCompliancePayload() {
  return {
    notice: realtorCompliance.complianceNotice(),
    scopes: realtorCompliance.requiredScopesList(),
    scopesNotice: realtorCompliance.housingScopesNotice(),
    restrictedKeys: realtorCompliance.RESTRICTED_TARGETING_KEYS
  };
}

export class SdkStudioServer {
  private readonly config: SdkConfigStore;
  private readonly port: number;
  private readonly host: string;
  private readonly studioDir: string;
  private readonly fetchImpl?: typeof fetch;
  private readonly server: HttpServer;
  private readonly sdkApprovalTokens = new Map<string, { action: string; risk: string; paramsHash: string; expiresAt: number }>();
  private readonly actionLogs: Array<Record<string, unknown>> = [];

  constructor(options: SdkServerOptions = {}) {
    this.port = Number(options.port || 0);
    this.host = String(options.host || "127.0.0.1").trim() || "127.0.0.1";
    this.config = new SdkConfigStore(options.configPath);
    this.fetchImpl = options.fetchImpl;
    const moduleDir = dirname(fileURLToPath(import.meta.url));
    this.studioDir = resolve(options.studioDir || join(moduleDir, "..", "studio"));
    this.server = createServer((req, res) => {
      this.handle(req, res).catch((error) => {
        this.sendJson(res, 500, { ok: false, error: String((error as Error)?.message || error || "Internal error") });
      });
    });
  }

  get portNumber(): number {
    const address = this.server.address();
    if (address && typeof address === "object") return address.port;
    return this.port;
  }

  get store(): SdkConfigStore {
    return this.config;
  }

  get listener(): HttpServer {
    return this.server;
  }

  start(): Promise<number> {
    return new Promise((resolveStart, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.port, this.host, () => {
        this.server.removeListener("error", reject);
        resolveStart(this.portNumber);
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolveStop) => {
      this.server.close(() => resolveStop());
    });
  }

  private sendJson(res: ServerResponse, status: number, payload: unknown): void {
    const body = JSON.stringify(payload, null, 2);
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(body);
  }

  private sendText(res: ServerResponse, status: number, text: string, headers: Record<string, string> = {}): void {
    res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", ...headers });
    res.end(text);
  }

  private sendFile(res: ServerResponse, status: number, filePath: string): void {
    const body = readFileSync(filePath);
    res.writeHead(status, { "Content-Type": mimeFor(filePath) });
    res.end(body);
  }

  private resolveStudioAsset(routePath: string): string {
    const requested = String(routePath || "/").trim();
    const normalized = requested === "/" ? "/index.html" : requested;
    if (!normalized.startsWith("/") || normalized.includes("\0")) return "";
    const rel = normalized.replace(/^\/+/, "");
    if (!rel) return "";
    const ext = extname(normalized);
    const candidate = resolve(this.studioDir, rel);
    const root = resolve(this.studioDir);
    if (!candidate.startsWith(`${root}${"/"}`) && candidate !== root) return "";
    if (!ext && !existsSync(candidate)) {
      const indexPath = resolve(root, "index.html");
      return existsSync(indexPath) ? indexPath : "";
    }
    if (!existsSync(candidate) || !statSync(candidate).isFile()) return "";
    return candidate;
  }

  private configSnapshot() {
    return {
      activeProfile: "default",
      profiles: ["default"],
      apiVersion: this.config.graphVersion,
      defaultApi: "facebook",
      tokens: {
        facebook: { configured: this.config.hasToken, preview: maskToken(this.config.token) },
        instagram: { configured: false, preview: "" },
        whatsapp: { configured: Boolean(this.config.defaultWhatsAppNumberId), preview: maskToken(this.config.defaultWhatsAppNumberId) }
      },
      app: { appId: "", appSecretConfigured: false },
      agent: {
        provider: "ollama",
        model: "",
        modelTiers: { cheap: "", balanced: "", premium: "" },
        apiKeyConfigured: true
      },
      onboarding: { completed: false, completedAt: "", version: "" },
      defaults: {
        facebookPageId: this.config.defaultPageId,
        igUserId: "",
        whatsappPhoneNumberId: this.config.defaultWhatsAppNumberId,
        marketingAdAccountId: this.config.defaultAdAccountId
      },
      industry: {
        mode: "hybrid",
        selected: "realtor",
        source: "sdk",
        confidence: 1,
        detectorVersion: "sdk-embedded",
        detectedAt: new Date().toISOString(),
        manualLocked: false
      },
      region: { country: "IN", timezone: "Asia/Kolkata", regulatoryMode: "standard" }
    };
  }

  private doctorSnapshot() {
    const blockers = [];
    const advisories = [];
    if (!this.config.hasToken) {
      blockers.push("No Meta token configured. Add one in Studio Setup or set SOCIAL_META_TOKEN.");
    }
    if (!this.config.defaultAdAccountId) {
      advisories.push("Default ad account is not set.");
    }
    return {
      ok: blockers.length === 0,
      activeProfile: "default",
      defaultApi: "facebook",
      tokens: {
        facebook: this.config.hasToken,
        instagram: false,
        whatsapp: Boolean(this.config.defaultWhatsAppNumberId)
      },
      defaults: {
        facebookPageId: this.config.defaultPageId,
        whatsappPhoneNumberId: this.config.defaultWhatsAppNumberId,
        marketingAdAccountId: this.config.defaultAdAccountId
      },
      blockers,
      advisories,
      keyless: true,
      configPath: this.config.configPath
    };
  }

  private issueSdkApprovalToken({ action, risk, params }: { action: string; risk: string; params: Record<string, unknown> }) {
    const now = Date.now();
    const token = `ap_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    const expiresAt = now + SDK_APPROVAL_TTL_MS;
    this.sdkApprovalTokens.set(token, {
      action: String(action || ""),
      risk: String(risk || ""),
      paramsHash: sdkParamsHash(params || {}),
      expiresAt
    });
    return {
      approvalToken: token,
      approvalTokenExpiresAt: new Date(expiresAt).toISOString()
    };
  }

  private consumeSdkApprovalToken({ token, action, params }: { token: string; action: string; params: Record<string, unknown> }) {
    const value = String(token || "").trim();
    if (!value) {
      return { ok: false, code: "APPROVAL_REQUIRED", message: "Approval token is required for this action." };
    }
    const row = this.sdkApprovalTokens.get(value);
    if (!row) {
      return { ok: false, code: "APPROVAL_INVALID", message: "Approval token is invalid or already used." };
    }
    if (Number(row.expiresAt || 0) <= Date.now()) {
      this.sdkApprovalTokens.delete(value);
      return { ok: false, code: "APPROVAL_EXPIRED", message: "Approval token expired. Request a new plan." };
    }
    if (String(row.action || "") !== String(action || "")) {
      return { ok: false, code: "APPROVAL_MISMATCH", message: "Approval token does not match this action." };
    }
    if (String(row.paramsHash || "") !== sdkParamsHash(params || {})) {
      return { ok: false, code: "APPROVAL_MISMATCH", message: "Approval token does not match current params." };
    }
    this.sdkApprovalTokens.delete(value);
    return { ok: true, approval: row };
  }

  private appendActionLog(entry: Record<string, unknown>): void {
    this.actionLogs.unshift({
      id: `log_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      ...entry,
      ts: new Date().toISOString()
    });
    if (this.actionLogs.length > 200) this.actionLogs.length = 200;
  }

  private requiredToken(): string {
    const token = this.config.token;
    if (token) return token;
    throw new Error("Missing Meta token. Set it in Studio Setup, or run the SDK with SOCIAL_META_TOKEN.");
  }

  async executeSdkAction(action: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const normalizedAction = normalizeSdkAction(action);
    if (!normalizedAction) throw new Error(`Unsupported SDK action: ${action}`);

    if (normalizedAction === "status") {
      return {
        service: "social-flow-sdk",
        mode: "standalone",
        keyless: true,
        version: process.env.npm_package_version || "0.1.0",
        workspace: "default",
        now: new Date().toISOString(),
        config: this.configSnapshot()
      };
    }

    if (normalizedAction === "doctor") {
      return this.doctorSnapshot();
    }

    if (normalizedAction === "get_profile") {
      const token = this.requiredToken();
      const fields = String(params.fields || "id,name").trim() || "id,name";
      const executor = createMetaExecutor(this.config.asSocialConfig(), this.fetchImpl);
      return await executor.get("me", { fields });
    }

    if (normalizedAction === "create_post") {
      const userToken = this.requiredToken();
      const message = String(params.message || "").trim();
      const link = String(params.link || "").trim();
      if (!message && !link) throw new Error("create_post requires `message` or `link`.");

      const executor = createMetaExecutor(this.config.asSocialConfig(), this.fetchImpl);
      const pagesResult = await executor.get("me/accounts", { fields: "id,name,access_token", limit: "50" });
      const pages = asArray(pagesResult?.data);
      if (!pages.length) throw new Error("No Facebook pages available for this token.");

      const requestedPageId = String(params.pageId || params.page || this.config.defaultPageId).trim();
      const selected = pages.find((row) => String((row as { id?: unknown }).id || "") === requestedPageId) || pages[0];
      const pageId = String((selected as { id?: unknown }).id || "").trim();
      const pageAccessToken = String((selected as { access_token?: unknown }).access_token || "").trim();
      if (!pageId || !pageAccessToken) {
        throw new Error("Unable to resolve page access token for post creation.");
      }

      const payload: Record<string, unknown> = {};
      if (message) payload.message = message;
      if (link) payload.link = link;
      const scheduleValue = parseScheduleToUnixSeconds(params.schedule);
      if (params.schedule && !scheduleValue) {
        throw new Error("Invalid schedule value. Use unix seconds or ISO date.");
      }
      const draft = toBool(params.draft, false);
      if (scheduleValue) {
        payload.published = false;
        payload.scheduled_publish_time = scheduleValue;
      } else if (draft) {
        payload.published = false;
      }

      const pageExecutor = createMetaExecutor(
        { ...this.config.asSocialConfig(), token: pageAccessToken },
        this.fetchImpl
      );
      const result = await pageExecutor.post(`${pageId}/feed`, payload as Record<string, string>);
      return {
        pageId,
        postId: String(result?.id || ""),
        result
      };
    }

    if (normalizedAction === "list_ads") {
      const token = this.requiredToken();
      const adAccountId = parseActId(params.adAccountId || params.accountId || this.config.defaultAdAccountId);
      if (!adAccountId) throw new Error("Missing ad account id. Set default or pass `adAccountId`.");
      const limit = Math.max(1, Math.min(200, toNumber(params.limit, 25) || 25));
      const fields = String(params.fields || "id,name,objective,status,daily_budget").trim() || "id,name,objective,status,daily_budget";
      const executor = createMetaExecutor(this.config.asSocialConfig(), this.fetchImpl);
      const result = await executor.get(`${adAccountId}/campaigns`, { fields, limit: String(limit) });
      return {
        adAccountId,
        count: asArray(result?.data).length,
        result
      };
    }

    if (normalizedAction === "send_whatsapp") {
      const token = this.requiredToken();
      const from = String(params.from || params.phoneNumberId || this.config.defaultWhatsAppNumberId).trim();
      const to = String(params.to || "").trim();
      const body = String(params.body || "").trim();
      if (!from) throw new Error("Missing WhatsApp phone number id (`from`).");
      if (!to) throw new Error("Missing destination number (`to`).");
      if (!body) throw new Error("Missing message body (`body`).");
      const executor = createMetaExecutor(this.config.asSocialConfig(), this.fetchImpl);
      const result = await executor.post(`${from}/messages`, {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: JSON.stringify({ body })
      });
      let parsedText: unknown = null;
      try {
        parsedText = JSON.parse(String(result?.text || "null"));
      } catch {
        parsedText = result?.text;
      }
      return {
        from,
        to,
        messageId: String((result?.messages as Array<{ id?: unknown }> | undefined)?.[0]?.id || ""),
        result: { ...result, text: parsedText }
      };
    }

    if (normalizedAction === "logs") {
      const limit = Math.max(1, Math.min(100, toNumber(params.limit, 20) || 20));
      return { count: this.actionLogs.slice(0, limit).length, items: this.actionLogs.slice(0, limit) };
    }

    if (normalizedAction === "replay") {
      const requestedId = String(params.id || "").trim().toLowerCase();
      if (!this.actionLogs.length) throw new Error("No logs available for replay.");
      const target = (requestedId === "latest" || requestedId === "last" || !requestedId)
        ? this.actionLogs[0]
        : this.actionLogs.find((row) => String(row.id || "").toLowerCase() === requestedId);
      if (!target) throw new Error(`Replay log not found: ${requestedId}`);
      const sourceAction = String(target.action || "").trim();
      const mappedAction = sourceAction.startsWith("sdk:")
        ? normalizeSdkAction(sourceAction.slice(4))
        : "";
      if (!mappedAction || mappedAction === "replay") {
        throw new Error(`Replay unsupported for action ${sourceAction || "<empty>"}`);
      }
      const replayData = await this.executeSdkAction(mappedAction, isPlainObject(target.params) ? target.params : {});
      return {
        replayedLogId: target.id,
        originalAction: sourceAction,
        mappedAction,
        data: replayData
      };
    }

    if (normalizedAction === "realtor_scopes") {
      return realtorCompliancePayload();
    }

    if (normalizedAction === "realtor_build") {
      const brief = realtorBriefFromBody(params);
      const missing = realtorBrief.requiredFields(brief, false);
      const formatted = realtorBrief.formatBrief(brief);
      return {
        brief,
        missing,
        complete: missing.length === 0,
        formatted,
        compliance: realtorCompliancePayload()
      };
    }

    if (normalizedAction === "realtor_preview") {
      const brief = realtorBriefFromBody(params);
      const context = realtorContextFromBrief(brief);
      const opts = realtorOptsFromBody(params, brief);
      return {
        brief,
        context,
        opts,
        payloads: realtorCampaign.buildAllPayloads(context, opts),
        compliance: realtorCompliancePayload()
      };
    }

    if (normalizedAction === "realtor_create_campaign") {
      const brief = realtorBriefFromBody(params);
      const missing = realtorBrief.requiredFields(brief, true);
      if (missing.length) {
        throw new Error(`Missing required fields: ${missing.join(", ")}. Complete the brief or run onboarding first.`);
      }
      const context = realtorContextFromBrief(brief);
      const opts = realtorOptsFromBody(params, brief);
      const result = await realtorCampaign.createHousingCampaign(
        realtorExecutorFromConfig(this.config, this.fetchImpl),
        realtorConfigLike(this.config),
        context,
        opts
      );
      return { result, compliance: realtorCompliancePayload() };
    }

    if (normalizedAction === "realtor_report") {
      const report = await realtorReport.fetchCampaignReport(
        realtorExecutorFromConfig(this.config, this.fetchImpl),
        realtorConfigLike(this.config),
        String(params.adAccountId || ""),
        String(params.campaignId || ""),
        {
          preset: String(params.preset || "last_7d"),
          level: (String(params.level || "campaign")) as "campaign" | "adset" | "ad",
          limit: Math.max(1, Math.min(200, toNumber(params.limit, 20) || 20))
        }
      );
      return { report, compliance: realtorCompliancePayload() };
    }

    if (normalizedAction === "realtor_leads") {
      const leads = await realtorLeadForms.fetchLeads(
        realtorExecutorFromConfig(this.config, this.fetchImpl),
        realtorConfigLike(this.config),
        {
          adAccountId: String(params.adAccountId || ""),
          adId: String(params.adId || ""),
          startTime: toNumber(params.startTime, 0),
          endTime: toNumber(params.endTime, 0),
          limit: Math.max(1, Math.min(200, toNumber(params.limit, 25) || 25))
        }
      );
      return { leads, count: leads.length };
    }

    if (normalizedAction === "realtor_leadform") {
      const brief = realtorBriefFromBody(params);
      const form = realtorLeadFormFromBody(params, brief);
      if (!form.privacyPolicyUrl) {
        throw new Error("Missing required field: privacyPolicyUrl.");
      }
      const result = await realtorLeadForms.createLeadForm(
        realtorExecutorFromConfig(this.config, this.fetchImpl),
        realtorConfigLike(this.config),
        form.pageId,
        form.name,
        {
          privacyPolicyUrl: form.privacyPolicyUrl,
          contextType: form.contextType,
          followUpActionUrl: form.followUpActionUrl,
          questions: form.questions,
          optimizedForQuality: form.optimizedForQuality
        }
      );
      return { result };
    }

    if (normalizedAction === "realtor_capi") {
      const event = realtorCapiEventFromBody(params);
      const result = await realtorCapi.sendEvent(
        realtorExecutorFromConfig(this.config, this.fetchImpl),
        realtorConfigLike(this.config),
        String(params.adAccountId || ""),
        event
      );
      return { result };
    }

    throw new Error(`No executor for action ${normalizedAction}`);
  }

  private async handleApi(req: IncomingMessage, res: ServerResponse, route: string, method: string): Promise<void> {
    if (method === "GET" && route === "/api/health") {
      this.sendJson(res, 200, { ok: true, service: "social-flow-sdk", keyless: true, now: new Date().toISOString() });
      return;
    }

    if (method === "GET" && route === "/api/status") {
      this.sendJson(res, 200, {
        ok: true,
        service: "social-flow-sdk",
        keyless: true,
        workspace: "default",
        now: new Date().toISOString(),
        config: this.configSnapshot()
      });
      return;
    }

    if (method === "GET" && route === "/api/config") {
      this.sendJson(res, 200, {
        config: this.configSnapshot(),
        readiness: this.doctorSnapshot(),
        now: new Date().toISOString()
      });
      return;
    }

    if (method === "POST" && route === "/api/config/update") {
      try {
        const body = await readBody(req);
        const updated: string[] = [];
        const tokens = isPlainObject(body.tokens) ? body.tokens : {};
        if (Object.prototype.hasOwnProperty.call(tokens, "facebook")) {
          const token = String(tokens.facebook || "").trim();
          if (token) {
            this.config.setToken(token);
            updated.push("tokens.facebook");
          }
        }
        if (Object.prototype.hasOwnProperty.call(body, "defaultApi")) {
          const nextDefaultApi = String(body.defaultApi || "").trim().toLowerCase();
          if (nextDefaultApi && !["facebook", "instagram", "whatsapp"].includes(nextDefaultApi)) {
            throw new Error("Invalid defaultApi. Use facebook, instagram, or whatsapp.");
          }
        }
        const defaults = isPlainObject(body.defaults) ? body.defaults : {};
        const defaultPatch: { pageId?: string; adAccountId?: string; whatsAppNumberId?: string } = {};
        if (Object.prototype.hasOwnProperty.call(defaults, "facebookPageId")) {
          defaultPatch.pageId = String(defaults.facebookPageId || "").trim();
          updated.push("defaults.facebookPageId");
        }
        if (Object.prototype.hasOwnProperty.call(defaults, "marketingAdAccountId")) {
          defaultPatch.adAccountId = String(defaults.marketingAdAccountId || "").trim();
          updated.push("defaults.marketingAdAccountId");
        }
        if (Object.prototype.hasOwnProperty.call(defaults, "whatsappPhoneNumberId")) {
          defaultPatch.whatsAppNumberId = String(defaults.whatsappPhoneNumberId || "").trim();
          updated.push("defaults.whatsappPhoneNumberId");
        }
        if (Object.keys(defaultPatch).length) this.config.setDefaults(defaultPatch);
        if (Object.prototype.hasOwnProperty.call(body, "apiVersion")) {
          this.config.setGraphVersion(String(body.apiVersion || ""));
          updated.push("apiVersion");
        }
        this.sendJson(res, 200, {
          ok: true,
          updated,
          config: this.configSnapshot(),
          readiness: this.doctorSnapshot()
        });
      } catch (error) {
        this.sendJson(res, 400, { ok: false, error: String((error as Error)?.message || error || "") });
      }
      return;
    }

    if (method === "GET" && route === "/api/sdk/status") {
      const traceId = sdkTraceId();
      const action = "status";
      const risk = sdkRiskForAction(action);
      const data = await this.executeSdkAction(action, {});
      this.sendJson(res, 200, sdkEnvelopeOk({ traceId, action, risk, requiresApproval: false, data }));
      return;
    }

    if (method === "GET" && route === "/api/sdk/doctor") {
      const traceId = sdkTraceId();
      const action = "doctor";
      const risk = sdkRiskForAction(action);
      const data = await this.executeSdkAction(action, {});
      this.sendJson(res, 200, sdkEnvelopeOk({ traceId, action, risk, requiresApproval: false, data }));
      return;
    }

    if (method === "GET" && route === "/api/sdk/actions") {
      const traceId = sdkTraceId();
      const actions = Object.keys(SDK_ACTION_RISK).map((action) => ({
        action,
        risk: sdkRiskForAction(action),
        requiresApproval: sdkRequiresApproval(action)
      }));
      this.sendJson(res, 200, sdkEnvelopeOk({
        traceId,
        action: "actions",
        risk: "LOW",
        requiresApproval: false,
        data: { actions }
      }));
      return;
    }

    if (method === "POST" && route === "/api/sdk/actions/plan") {
      const traceId = sdkTraceId();
      try {
        const body = await readBody(req);
        const action = normalizeSdkAction(body.action);
        if (!action) {
          const invalid = sdkEnvelopeError({
            traceId,
            status: 400,
            action: String(body.action || ""),
            code: "INVALID_ACTION",
            message: "Unsupported action.",
            suggestedNextCommand: "Use GET /api/sdk/actions to list supported actions.",
            details: { supportedActions: Object.keys(SDK_ACTION_RISK) }
          });
          this.sendJson(res, invalid.status, invalid.payload);
          return;
        }
        const params = isPlainObject(body.params) ? body.params : {};
        const risk = sdkRiskForAction(action);
        const requiresApproval = sdkRequiresApproval(action);
        let approvalToken = "";
        let approvalTokenExpiresAt = "";
        if (requiresApproval) {
          const issued = this.issueSdkApprovalToken({ action, risk, params });
          approvalToken = issued.approvalToken;
          approvalTokenExpiresAt = issued.approvalTokenExpiresAt;
        }
        this.sendJson(res, 200, sdkEnvelopeOk({
          traceId,
          action,
          risk,
          requiresApproval,
          approvalToken,
          approvalTokenExpiresAt,
          data: {
            planned: true,
            action,
            params,
            risk,
            requiresApproval,
            approvalToken: approvalToken || null,
            approvalTokenExpiresAt: approvalTokenExpiresAt || null
          }
        }));
      } catch (error) {
        const failed = sdkErrorFromThrown(error, {
          traceId,
          status: 400,
          action: "plan",
          risk: "LOW",
          code: "PLAN_FAILED",
          message: "Unable to create action plan."
        });
        this.sendJson(res, failed.status, failed.payload);
      }
      return;
    }

    if (method === "POST" && route === "/api/sdk/actions/execute") {
      const traceId = sdkTraceId();
      const startedAt = Date.now();
      let actionForLog = "";
      let paramsForLog: Record<string, unknown> = {};
      try {
        const body = await readBody(req);
        const action = normalizeSdkAction(body.action);
        actionForLog = action;
        if (!action) {
          const invalid = sdkEnvelopeError({
            traceId,
            status: 400,
            action: String(body.action || ""),
            code: "INVALID_ACTION",
            message: "Unsupported action.",
            suggestedNextCommand: "Use GET /api/sdk/actions to list supported actions.",
            details: { supportedActions: Object.keys(SDK_ACTION_RISK) }
          });
          this.sendJson(res, invalid.status, invalid.payload);
          return;
        }

        const params = isPlainObject(body.params) ? body.params : {};
        paramsForLog = params;
        const risk = sdkRiskForAction(action);
        const requiresApproval = sdkRequiresApproval(action);
        const approvalTokenIn = String(body.approvalToken || "").trim();
        const approvalReason = String(body.approvalReason || "").trim();

        if (requiresApproval) {
          const consumed = this.consumeSdkApprovalToken({ token: approvalTokenIn, action, params });
          if (!consumed.ok) {
            const issued = this.issueSdkApprovalToken({ action, risk, params });
            const approvalRequired = sdkEnvelopeError({
              traceId,
              status: 428,
              action,
              risk,
              requiresApproval: true,
              approvalToken: issued.approvalToken,
              approvalTokenExpiresAt: issued.approvalTokenExpiresAt,
              code: consumed.code || "APPROVAL_REQUIRED",
              message: consumed.message || "Approval token required.",
              suggestedNextCommand: "Call /api/sdk/actions/execute again with approvalToken and approvalReason."
            });
            this.sendJson(res, approvalRequired.status, approvalRequired.payload);
            return;
          }
          if (risk === "HIGH" && !approvalReason) {
            const issued = this.issueSdkApprovalToken({ action, risk, params });
            const reasonRequired = sdkEnvelopeError({
              traceId,
              status: 400,
              action,
              risk,
              requiresApproval: true,
              approvalToken: issued.approvalToken,
              approvalTokenExpiresAt: issued.approvalTokenExpiresAt,
              code: "APPROVAL_REASON_REQUIRED",
              message: "High-risk actions require approvalReason.",
              suggestedNextCommand: "Retry /api/sdk/actions/execute with approvalReason."
            });
            this.sendJson(res, reasonRequired.status, reasonRequired.payload);
            return;
          }
        }

        const data = await this.executeSdkAction(action, params);
        this.appendActionLog({
          action: `sdk:${action}`,
          params,
          latency: Date.now() - startedAt,
          success: true,
          rollback_plan: action === "create_post"
            ? "Delete created post if needed."
            : action === "send_whatsapp"
              ? "No rollback for sent messages."
              : "Read-only. No rollback required.",
          trace_id: traceId,
          risk
        });
        this.sendJson(res, 200, sdkEnvelopeOk({ traceId, action, risk, requiresApproval, data }));
      } catch (error) {
        const action = normalizeSdkAction(actionForLog) || "";
        const risk = sdkRiskForAction(action) || "LOW";
        this.appendActionLog({
          action: action ? `sdk:${action}` : "sdk:unknown",
          params: paramsForLog,
          latency: Date.now() - startedAt,
          success: false,
          error: String((error as Error)?.message || error || ""),
          rollback_plan: "No rollback",
          trace_id: traceId,
          risk
        });
        const failed = sdkErrorFromThrown(error, {
          traceId,
          status: 400,
          action,
          risk,
          requiresApproval: sdkRequiresApproval(action),
          code: "EXECUTION_FAILED",
          message: "Action execution failed."
        });
        this.sendJson(res, failed.status, failed.payload);
      }
      return;
    }

    this.sendJson(res, 404, { ok: false, error: `Not found: ${route}` });
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = String(req.method || "GET").toUpperCase();
    const rawUrl = String(req.url || "/");
    const pathname = rawUrl.split("?")[0] || "/";

    if (pathname.startsWith("/api/")) {
      await this.handleApi(req, res, pathname, method);
      return;
    }

    if (method === "GET" || method === "HEAD") {
      const assetPath = this.resolveStudioAsset(pathname);
      if (!assetPath) {
        this.sendText(res, 404, "Not found");
        return;
      }
      this.sendFile(res, 200, assetPath);
      return;
    }

    this.sendText(res, 405, "Method not allowed");
  }
}

export function createSdkStudioServer(options: SdkServerOptions = {}): SdkStudioServer {
  return new SdkStudioServer(options);
}

export function defaultStudioDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "studio");
}

export { mask };
