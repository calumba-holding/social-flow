#!/usr/bin/env node
import { createSdkStudioServer } from "../dist/src/index.js";
import { spawn } from "node:child_process";

function parseArgs(argv) {
  const out = { port: 0, host: "127.0.0.1", open: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--port" || arg === "-p") {
      out.port = Number(argv[i + 1] || 0) || 0;
      i += 1;
    } else if (arg === "--host" || arg === "-h") {
      out.host = String(argv[i + 1] || "").trim() || "127.0.0.1";
      i += 1;
    } else if (arg === "--open" || arg === "-o") {
      out.open = true;
    } else if (arg === "--help" || arg === "help") {
      out.help = true;
    }
  }
  return out;
}

function printHelp() {
  console.log(`
Social Flow SDK Studio

Start the built-in keyless Realtor Ads Studio.

Usage:
  social-flow-sdk [--port 1350] [--host 127.0.0.1] [--open]

Options:
  -p, --port   Port to listen on (default: auto, or PORT env)
  -h, --host   Host to bind (default: 127.0.0.1)
  -o, --open   Open the studio in a browser automatically
  --help       Show this help

Environment:
  SOCIAL_SDK_CONFIG_PATH   Path to the JSON config file
  SOCIAL_META_TOKEN        Default Meta access token
  SOCIAL_DEFAULT_PAGE_ID   Default Facebook Page ID
  SOCIAL_DEFAULT_AD_ACCOUNT_ID  Default ad account ID

No API key is required. The studio runs keyless; you only add your
own Meta token when you want to push a real campaign.
`);
}

function openBrowser(url) {
  const platform = process.platform;
  let command;
  if (platform === "darwin") {
    command = "open";
  } else if (platform === "win32") {
    command = "cmd";
  } else {
    command = "xdg-open";
  }
  const child = platform === "win32"
    ? spawn(command, ["/c", "start", "", url], { stdio: "ignore", detached: true })
    : spawn(command, [url], { stdio: "ignore", detached: true });
  child.on("error", () => {});
  child.unref();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  const port = args.port || Number(process.env.PORT || 0) || 0;
  const host = args.host || process.env.HOST || "127.0.0.1";
  const server = createSdkStudioServer({ port, host });
  const actualPort = await server.start();
  const url = `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${actualPort}`;
  console.log("");
  console.log("  Social Flow SDK Studio running (keyless).");
  console.log("");
  console.log(`    Studio:  ${url}`);
  console.log(`    Health:  ${url}/api/health`);
  console.log(`    Actions: ${url}/api/sdk/actions`);
  console.log("");
  console.log("  Press Ctrl+C to stop.");
  console.log("");
  if (args.open) openBrowser(url);
}

main().catch((error) => {
  console.error(`[social-flow-sdk] ${String(error?.message || error)}`);
  process.exit(1);
});
