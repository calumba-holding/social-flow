import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { ExecutionResult, ParsedIntent, RiskLevel } from "../types.js";
import { maskCommandSecrets } from "../tui/command-assist.js";

export type Executor = (intent: ParsedIntent) => Promise<ExecutionResult>;

export interface RegisteredExecutor {
  action: ParsedIntent["action"];
  risk: RiskLevel;
  execute: Executor;
}

type CoreIntent = {
  action: "onboard" | "doctor" | "status" | "config" | "get" | "create" | "list" | "logs" | "replay";
  target: "system" | "profile" | "post" | "ads" | "logs";
  params: Record<string, string>;
  risk: "LOW" | "MEDIUM" | "HIGH";
};

type CoreRouteResponse = { data: Record<string, unknown>; rollback_plan: string };
type CoreActionLog = {
  id: string;
  action: string;
  params: Record<string, string>;
  timestamp: string;
};
type SocialConfig = {
  token: string;
  graphVersion: string;
  scopes: string[];
  defaultPageId?: string;
  defaultAdAccountId?: string;
  ai?: {
    provider?: "ollama" | "openai";
    model?: string;
    baseUrl?: string;
    apiKey?: string;
  };
};

type CoreModules = {
  routeIntent: (intent: CoreIntent, opts?: { replay?: boolean; skipRiskGate?: boolean }) => Promise<CoreRouteResponse>;
  readConfig: () => Promise<SocialConfig>;
  writeConfig: (cfg: SocialConfig) => Promise<void>;
  listLogs: () => Promise<CoreActionLog[]>;
  readLogById: (id: string) => Promise<CoreActionLog>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveModulePath(relativeToRepo: string): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, "../../../../");
  const candidates = [
    path.join(repoRoot, relativeToRepo),
    path.join(repoRoot, "dist-social", relativeToRepo)
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

async function loadCoreModules(): Promise<CoreModules> {
  const routerPath = resolveModulePath(path.join("core", "router.js"));
  const configPath = resolveModulePath(path.join("core", "config.js"));
  const logPath = resolveModulePath(path.join("core", "log-store.js"));
  if (!routerPath || !configPath || !logPath) {
    throw new Error("Core modules not found. Run `npm run build:social-ts` first.");
  }

  const routerMod = await import(pathToFileURL(routerPath).href) as { routeIntent: CoreModules["routeIntent"] };
  const configMod = await import(pathToFileURL(configPath).href) as {
    readConfig: CoreModules["readConfig"];
    writeConfig: CoreModules["writeConfig"];
  };
  const logMod = await import(pathToFileURL(logPath).href) as {
    listLogs: CoreModules["listLogs"];
    readLogById: CoreModules["readLogById"];
  };

  if (!routerMod.routeIntent || !configMod.readConfig || !configMod.writeConfig || !logMod.listLogs || !logMod.readLogById) {
    throw new Error("Core module exports are missing required functions.");
  }

  return {
    routeIntent: routerMod.routeIntent,
    readConfig: configMod.readConfig,
    writeConfig: configMod.writeConfig,
    listLogs: logMod.listLogs,
    readLogById: logMod.readLogById
  };
}

function toCoreIntent(intent: ParsedIntent): CoreIntent | null {
  if (intent.action === "get_profile") {
    return {
      action: "get",
      target: "profile",
      params: { fields: intent.params.fields || "id,name" },
      risk: "LOW"
    };
  }
  if (intent.action === "create_post") {
    return {
      action: "create",
      target: "post",
      params: {
        message: intent.params.message || "",
        pageId: intent.params.pageId || ""
      },
      risk: "MEDIUM"
    };
  }
  if (intent.action === "list_ads") {
    return {
      action: "list",
      target: "ads",
      params: { adAccountId: intent.params.adAccountId || "" },
      risk: "LOW"
    };
  }
  return null;
}

function coreActionToIntent(logAction: string): Pick<CoreIntent, "action" | "target" | "risk"> | null {
  if (logAction === "get:profile") return { action: "get", target: "profile", risk: "LOW" };
  if (logAction === "create:post") return { action: "create", target: "post", risk: "MEDIUM" };
  if (logAction === "list:ads") return { action: "list", target: "ads", risk: "LOW" };
  return null;
}

async function executeViaCoreRouter(intent: ParsedIntent): Promise<ExecutionResult> {
  const coreIntent = toCoreIntent(intent);
  if (!coreIntent) {
    return {
      ok: false,
      output: { error: `No core mapping for action ${intent.action}` }
    };
  }
  const { routeIntent } = await loadCoreModules();
  const result = await routeIntent(coreIntent, { skipRiskGate: true });
  return {
    ok: true,
    output: result.data,
    rollback: {
      note: result.rollback_plan,
      status: "STUB"
    }
  };
}

type CapturedCommandResult = {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  runner: string;
};

type SocialCliRunner = {
  command: string;
  baseArgs: string[];
  runner: string;
};

function parseCommandTokens(raw: string): string[] {
  const text = String(raw || "").trim();
  if (!text) return [];
  const out: string[] = [];
  const token = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|`((?:\\.|[^`\\])*)`|([^\s]+)/g;
  let match: RegExpExecArray | null;
  while ((match = token.exec(text)) !== null) {
    const value = match[1] ?? match[2] ?? match[3] ?? match[4] ?? "";
    out.push(value.replace(/\\(["'`\\])/g, "$1"));
  }
  return out;
}

function hasFlag(tokens: string[], flags: string[]): boolean {
  return tokens.some((token) => {
    const value = String(token || "");
    return flags.some((flag) => value === flag || value.startsWith(`${flag}=`));
  });
}

function flagValue(tokens: string[], flags: string[]): string {
  for (let i = 0; i < tokens.length; i += 1) {
    const token = String(tokens[i] || "");
    for (const flag of flags) {
      if (token === flag) {
        const next = String(tokens[i + 1] || "");
        if (next && !next.startsWith("-")) return next;
      }
      if (token.startsWith(`${flag}=`)) {
        return token.slice(flag.length + 1);
      }
    }
  }
  return "";
}

type InteractiveCliGuard = {
  blocked: boolean;
  reason: string;
  suggestion: string;
};

function detectInteractiveCliGuard(tokens: string[]): InteractiveCliGuard {
  const cmd = String(tokens[1] || "").toLowerCase();
  const sub = String(tokens[2] || "").toLowerCase();

  if (cmd === "auth" && !sub) {
    return {
      blocked: true,
      reason: "This command needs a sub-command.",
      suggestion: "social auth login -a facebook"
    };
  }

  if (cmd === "auth" && sub === "login") {
    const api = (flagValue(tokens, ["--api", "-a"]) || "facebook").toLowerCase();
    const token = flagValue(tokens, ["--token", "-t"]);
    const useOauth = hasFlag(tokens, ["--oauth"]);
    const asksScopePrompt = hasFlag(tokens, ["--scopes"]);
    if (!token || useOauth || asksScopePrompt) {
      const nextApi = api === "instagram" || api === "whatsapp" ? api : "facebook";
      return {
        blocked: true,
        reason: "This command needs interactive input/browser steps, which Hatch passthrough cannot run safely.",
        suggestion: `social auth login -a ${nextApi} --token YOUR_${nextApi.toUpperCase()}_TOKEN --no-open`
      };
    }
  }

  if (cmd === "auth" && sub === "app") {
    const appId = flagValue(tokens, ["--id"]);
    const appSecret = flagValue(tokens, ["--secret"]);
    if (!appId || !appSecret) {
      return {
        blocked: true,
        reason: "This command prompts for App ID/Secret interactively, which Hatch passthrough cannot run.",
        suggestion: "social auth app --id APP_ID --secret APP_SECRET --no-open"
      };
    }
  }

  if (cmd === "onboard" || cmd === "setup" || cmd === "start-here") {
    return {
      blocked: true,
      reason: "This is an interactive wizard command and cannot run inside Hatch passthrough mode.",
      suggestion: `social ${cmd} --help`
    };
  }

  if (cmd === "integrations" && sub === "connect" && String(tokens[3] || "").toLowerCase() === "waba") {
    const hasToken = Boolean(flagValue(tokens, ["--token"]));
    const hasBusinessId = Boolean(flagValue(tokens, ["--business-id", "--businessId"]));
    const hasWabaId = Boolean(flagValue(tokens, ["--waba-id", "--wabaId"]));
    const hasPhoneNumberId = Boolean(flagValue(tokens, ["--phone-number-id", "--phoneNumberId"]));
    if (!hasToken || !hasBusinessId || !hasWabaId || !hasPhoneNumberId) {
      return {
        blocked: true,
        reason: "WABA connect needs interactive prompts for missing fields, which Hatch passthrough cannot run.",
        suggestion: "waba setup"
      };
    }
  }

  return { blocked: false, reason: "", suggestion: "" };
}

function resolveSocialCliRunner(): SocialCliRunner {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, "../../../../");
  const localCandidates = [
    path.join(repoRoot, "dist-legacy", "bin", "social.js"),
    path.join(repoRoot, "bin", "social.js")
  ];
  for (const candidate of localCandidates) {
    if (existsSync(candidate)) {
      return { command: process.execPath, baseArgs: [candidate], runner: candidate };
    }
  }
  return { command: process.platform === "win32" ? "social.cmd" : "social", baseArgs: [], runner: "PATH:social" };
}

function appendBounded(current: string, chunk: string, maxChars: number): string {
  if (!chunk) return current;
  const remaining = Math.max(0, maxChars - current.length);
  if (remaining <= 0) return current;
  return current + chunk.slice(0, remaining);
}

async function runCapturedCommand(command: string, args: string[], opts: {
  timeoutMs?: number;
  maxChars?: number;
  runner?: string;
} = {}): Promise<CapturedCommandResult> {
  const timeoutMs = Math.max(5000, opts.timeoutMs || 45_000);
  const maxChars = Math.max(2048, opts.maxChars || 14_000);
  return await new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    const done = (payload: CapturedCommandResult) => {
      if (settled) return;
      settled = true;
      resolve(payload);
    };

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string | Buffer) => {
      stdout = appendBounded(stdout, String(chunk), maxChars);
    });
    child.stderr?.on("data", (chunk: string | Buffer) => {
      stderr = appendBounded(stderr, String(chunk), maxChars);
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      stderr = appendBounded(stderr, `\nCommand timed out after ${timeoutMs}ms.`, maxChars);
      child.kill("SIGTERM");
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timeout);
      done({
        ok: false,
        exitCode: -1,
        stdout: stdout.trim(),
        stderr: appendBounded(stderr, String(error?.message || error), maxChars).trim(),
        timedOut,
        runner: opts.runner || command
      });
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      const exitCode = typeof code === "number" ? code : -1;
      done({
        ok: exitCode === 0 && !timedOut,
        exitCode,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        timedOut,
        runner: opts.runner || command
      });
    });
  });
}

async function executeSocialCliIntent(intent: ParsedIntent): Promise<ExecutionResult> {
  const raw = String(intent.params.command || "").trim();
  const displayCommand = maskCommandSecrets(raw);
  if (!raw) return { ok: false, output: { error: "Missing command. Use: social <command>" } };

  const tokens = parseCommandTokens(raw);
  if (!tokens.length) return { ok: false, output: { error: "Unable to parse command tokens." } };

  const binary = String(tokens[0] || "").toLowerCase();
  if (binary !== "social" && binary !== "social-flow") {
    return { ok: false, output: { error: "Only `social` commands are allowed in Hatch chat passthrough." } };
  }

  const interactiveGuard = detectInteractiveCliGuard(tokens);
  if (interactiveGuard.blocked) {
    return {
      ok: false,
      output: {
        command: displayCommand,
        exit_code: 2,
        runner: "guard",
        timed_out: false,
        stdout: "",
        stderr: "",
        suggestion: interactiveGuard.suggestion,
        error: `${interactiveGuard.reason} Try: ${interactiveGuard.suggestion}`
      },
      rollback: {
        note: "Command not executed due to interactive requirement.",
        status: "DONE"
      }
    };
  }

  const runner = resolveSocialCliRunner();
  const args = [...runner.baseArgs, ...tokens.slice(1)];
  const result = await runCapturedCommand(runner.command, args, { runner: runner.runner });
  const stderr = String(result.stderr || "").trim();
  return {
    ok: result.ok,
    output: {
      command: displayCommand,
      exit_code: result.exitCode,
      runner: result.runner,
      timed_out: result.timedOut,
      stdout: result.stdout,
      stderr,
      error: result.ok ? "" : (stderr || `Command failed with exit code ${result.exitCode}.`)
    },
    rollback: {
      note: "Executed explicit CLI command. No automatic rollback available.",
      status: "STUB"
    }
  };
}

const executors: Record<ParsedIntent["action"], RegisteredExecutor> = {
  onboard: {
    action: "onboard",
    risk: "MEDIUM",
    execute: async (intent) => {
      const { readConfig, writeConfig } = await loadCoreModules();
      const cfg = await readConfig();
      const next: SocialConfig = {
        ...cfg,
        token: intent.params.token || cfg.token,
        graphVersion: intent.params.graphVersion || cfg.graphVersion || "v26.0",
        scopes: (intent.params.scopes || "").split(",").map((x) => x.trim()).filter(Boolean).length
          ? (intent.params.scopes || "").split(",").map((x) => x.trim()).filter(Boolean)
          : cfg.scopes,
        defaultPageId: intent.params.defaultPageId || cfg.defaultPageId,
        defaultAdAccountId: intent.params.defaultAdAccountId || cfg.defaultAdAccountId,
        ai: {
          provider: (intent.params.provider as "ollama" | "openai") || cfg.ai?.provider || "ollama",
          model: intent.params.model || cfg.ai?.model || "qwen2.5:7b",
          baseUrl: intent.params.baseUrl || cfg.ai?.baseUrl || "http://127.0.0.1:11434",
          apiKey: intent.params.apiKey || cfg.ai?.apiKey || ""
        }
      };
      await writeConfig(next);
      return {
        ok: true,
        output: {
          updated: true,
          graphVersion: next.graphVersion,
          scopes: next.scopes,
          defaultPageId: next.defaultPageId || null,
          defaultAdAccountId: next.defaultAdAccountId || null,
          ai: {
            provider: next.ai?.provider || "ollama",
            model: next.ai?.model || null,
            baseUrl: next.ai?.baseUrl || null,
            apiKeySet: !!next.ai?.apiKey
          }
        },
        rollback: {
          note: "Restore previous ~/.social-flow/config.json snapshot (manual rollback).",
          status: "STUB"
        }
      };
    }
  },
  guide: {
    action: "guide",
    risk: "LOW",
    execute: async (intent) => {
      const topic = String(intent.params.topic || "setup-auth").toLowerCase();
      const guides: Record<string, { label: string; message: string; suggestions: string[] }> = {
        "setup-auth": {
          label: "Setup/Auth",
          message: "I can walk you through token + app credential setup with minimum friction.",
          suggestions: [
            "social start-here",
            "social setup",
            "social auth login -a facebook",
            "social status"
          ]
        },
        facebook: {
          label: "Facebook",
          message: "I can help with Page profile checks and posting shortcuts.",
          suggestions: [
            "get my facebook profile",
            "create post \"Hello\" page 12345",
            "social facebook pages --table"
          ]
        },
        instagram: {
          label: "Instagram",
          message: "I can guide account/media actions and insights checks.",
          suggestions: [
            "social insta accounts list",
            "social instagram media --help",
            "/ai list instagram media"
          ]
        },
        waba: {
          label: "WhatsApp/WABA",
          message: "I can guide Cloud API setup, webhook checks, and template send tests.",
          suggestions: [
            "social integrations connect waba",
            "social waba send --from PHONE_ID --to +15551234567 --body \"Hello\"",
            "social waba send --help",
            "/ai send whatsapp test to +15551234567"
          ]
        },
        marketing: {
          label: "Marketing API",
          message: "I can help with ad account diagnostics and campaign visibility.",
          suggestions: [
            "list ads account act_123",
            "social marketing accounts",
            "/ai show active campaigns for act_123"
          ]
        }
      };
      const chosen = guides[topic] || guides["setup-auth"];
      return {
        ok: true,
        output: {
          topic,
          label: chosen.label,
          message: chosen.message,
          suggestions: chosen.suggestions
        },
        rollback: {
          note: "Read-only guidance action. No rollback required.",
          status: "DONE"
        }
      };
    }
  },
  help: {
    action: "help",
    risk: "LOW",
    execute: async () => ({
      ok: true,
      output: {
        message: "I can run setup checks, status/diagnostics, profile lookups, posting, ad listing, logs, and replay flows.",
        suggestions: [
          "status",
          "doctor",
          "get my facebook profile",
          "create post \"Hello\" page 12345",
          "list ads account act_123",
          "logs",
          "replay latest"
        ]
      },
      rollback: {
        note: "Read-only help action. No rollback required.",
        status: "DONE"
      }
    })
  },
  run_cli: {
    action: "run_cli",
    risk: "LOW",
    execute: executeSocialCliIntent
  },
  doctor: {
    action: "doctor",
    risk: "LOW",
    execute: async () => {
      const { readConfig } = await loadCoreModules();
      const cfg = await readConfig();
      const issues: string[] = [];
      if (!cfg.token || cfg.token.length < 20) issues.push("Token missing/invalid");
      if (!cfg.graphVersion) issues.push("Graph version missing");
      if (!Array.isArray(cfg.scopes)) issues.push("Scopes missing");
      return {
        ok: issues.length === 0,
        output: {
          ok: issues.length === 0,
          issues,
          token_set: !!cfg.token,
          graph_version: cfg.graphVersion,
          scopes: cfg.scopes
        },
        rollback: {
          note: "Read-only diagnostic. No rollback required.",
          status: "DONE"
        }
      };
    }
  },
  status: {
    action: "status",
    risk: "LOW",
    execute: async () => {
      const { readConfig } = await loadCoreModules();
      const cfg = await readConfig();
      return {
        ok: true,
        output: {
          token_set: !!cfg.token,
          graph_version: cfg.graphVersion,
          scopes: cfg.scopes,
          default_page_id: cfg.defaultPageId || null,
          default_ad_account_id: cfg.defaultAdAccountId || null,
          ai_provider: cfg.ai?.provider || "ollama",
          ai_model: cfg.ai?.model || null,
          ai_base_url: cfg.ai?.baseUrl || null,
          ai_key_set: !!cfg.ai?.apiKey
        },
        rollback: {
          note: "Read-only status. No rollback required.",
          status: "DONE"
        }
      };
    }
  },
  config: {
    action: "config",
    risk: "MEDIUM",
    execute: async () => {
      const { readConfig } = await loadCoreModules();
      const cfg = await readConfig();
      return {
        ok: true,
        output: {
          ...cfg,
          token: cfg.token ? `${cfg.token.slice(0, 5)}...` : ""
        },
        rollback: {
          note: "Read-only config view. No rollback required.",
          status: "DONE"
        }
      };
    }
  },
  logs: {
    action: "logs",
    risk: "LOW",
    execute: async (intent) => {
      const { listLogs } = await loadCoreModules();
      const limit = Math.max(1, Math.min(100, Number.parseInt(intent.params.limit || "20", 10) || 20));
      const logs = await listLogs();
      return {
        ok: true,
        output: {
          count: logs.length,
          items: logs.slice(0, limit)
        },
        rollback: {
          note: "Read-only log inspection. No rollback required.",
          status: "DONE"
        }
      };
    }
  },
  replay: {
    action: "replay",
    risk: "HIGH",
    execute: async (intent) => {
      const { readLogById, listLogs, routeIntent } = await loadCoreModules();
      const requestedId = intent.params.id || "";
      if (!requestedId) {
        return { ok: false, output: { error: "Missing replay log id." } };
      }
      let log: CoreActionLog;
      if (requestedId === "latest" || requestedId === "last") {
        const logs = await listLogs();
        if (!logs.length) return { ok: false, output: { error: "No logs available for replay." } };
        log = logs[0];
      } else {
        log = await readLogById(requestedId);
      }
      const mapping = coreActionToIntent(log.action);
      if (!mapping) {
        return { ok: false, output: { error: `Replay unsupported for action ${log.action}` } };
      }
      const replayIntent: CoreIntent = {
        action: mapping.action,
        target: mapping.target,
        params: log.params || {},
        risk: mapping.risk
      };
      const result = await routeIntent(replayIntent, { replay: true, skipRiskGate: true });
      return {
        ok: true,
        output: {
          replayed: log.id,
          original_action: log.action,
          data: result.data
        },
        rollback: {
          note: result.rollback_plan,
          status: "STUB"
        }
      };
    }
  },
  get_profile: {
    action: "get_profile",
    risk: "LOW",
    execute: executeViaCoreRouter
  },
  create_post: {
    action: "create_post",
    risk: "MEDIUM",
    execute: executeViaCoreRouter
  },
  list_ads: {
    action: "list_ads",
    risk: "LOW",
    execute: executeViaCoreRouter
  },
  get_status: {
    action: "get_status",
    risk: "LOW",
    execute: async () => {
      await sleep(150);
      return {
        ok: true,
        output: {
          service: "social-agentic-tui",
          status: "healthy",
          timestamp: new Date().toISOString()
        },
        rollback: {
          note: "Read-only action. Nothing to rollback.",
          status: "DONE"
        }
      };
    }
  },
  unknown: {
    action: "unknown",
    risk: "LOW",
    execute: async () => ({
      ok: false,
      output: {
        error: "I could not map that request yet. Try: help, status, doctor, logs, or /ai <intent>."
      }
    })
  }
};

export function getExecutor(action: ParsedIntent["action"]): RegisteredExecutor {
  return executors[action] || executors.unknown;
}
