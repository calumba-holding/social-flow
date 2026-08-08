# Social Flow SDK

Standalone SDK with a **built-in keyless Realtor Ads Studio**. Turn a plain project
brief into housing-compliant Meta ad campaign payloads, preview them, then push a
paused campaign — all from one dependency-free package. No API key required.

## Quick start (Studio)

```bash
npm --prefix sdk install
npm run build:sdk
npx --prefix sdk social-flow-sdk --open   # or: npm --prefix sdk run start -- --open
```

This starts a local server (no API key required), opens the embedded studio at
`http://127.0.0.1:<port>`, and serves:

- `GET  /` → the embedded Realtor Studio UI
- `GET  /api/health` → keyless health check
- `GET  /api/sdk/actions` → supported actions + risk levels
- `POST /api/sdk/actions/plan` / `execute` → SDK envelope endpoints
- `GET  /api/config` / `POST /api/config/update` → save your Meta token + defaults

The server runs keyless. You only paste **your own Meta access token** in the Studio
Setup panel (or set `SOCIAL_META_TOKEN`) when you want to make real Meta API calls.

### CLI options

```
social-flow-sdk [--port 1350] [--host 127.0.0.1] [--open]
```

Environment: `SOCIAL_SDK_CONFIG_PATH`, `SOCIAL_META_TOKEN`, `SOCIAL_DEFAULT_PAGE_ID`,
`SOCIAL_DEFAULT_AD_ACCOUNT_ID`.

## Programmatic use (client)

Typed client for the SDK envelope endpoints (`/api/sdk/*`). Point it at the built-in
server, or any Social Flow Gateway exposing the same routes.

```ts
import { createSocialFlowClient } from "@vishalgojha/social-flow-sdk";

const client = createSocialFlowClient({ baseUrl: "http://127.0.0.1:1350" });
```

## Embedded server

```ts
import { createSdkStudioServer } from "@vishalgojha/social-flow-sdk";

const server = createSdkStudioServer({ port: 1350 });
const port = await server.start();
// http://127.0.0.1:${port}/  ->  Realtor Studio
```

The server vendors the full realtor library (brief parsing, compliance, campaign
building, reporting, lead forms, Conversions API) with a zero-dependency Meta
executor built on Node's native `fetch`.

## Example

```ts
import { createSocialFlowClient } from "@vishalgojha/social-flow-sdk";

const client = createSocialFlowClient({
  baseUrl: "http://127.0.0.1:1310",
  gatewayKey: process.env.SOCIAL_GATEWAY_API_KEY || ""
});

const plan = await client.actions.plan("create_post", {
  message: "Launch update",
  pageId: "123456789"
});

if (plan.ok && plan.meta.requiresApproval && plan.meta.approvalToken) {
  const executed = await client.actions.execute(
    "create_post",
    { message: "Launch update", pageId: "123456789" },
    {
      approvalToken: plan.meta.approvalToken,
      approvalReason: "approved by operator"
    }
  );
  console.log(executed);
}
```

## Core Methods

- `client.health.status()`
- `client.health.doctor()`
- `client.profile.get(fields?)`
- `client.posts.create(input, approval?)`
- `client.ads.list(input?)`
- `client.whatsapp.send(input, approval?)`
- `client.logs.list(limit?)`
- `client.replay.run(input, approval?)`
- `client.actions.plan(action, params?)`
- `client.actions.execute(action, params?, approval?)`

## Realtor (housing ads)

- `client.realtor.scopes()` — housing compliance + required scopes
- `client.realtor.build(input)` — parse a project brief
- `client.realtor.preview(input)` — build campaign/ad set/creative/ad payloads offline
- `client.realtor.createCampaign(input, approval?)` — high-risk; creates a paused housing campaign
- `client.realtor.report(input?)` — campaign insights report
- `client.realtor.leads(input?)` — fetch lead form leads
- `client.realtor.leadform(input, approval?)` — create a Facebook lead form
- `client.realtor.capi(input, approval?)` — send a Conversions API event

### Example

```ts
const plan = await client.actions.plan("realtor_create_campaign", {
  text: "3 BHK in Sarjapur, Bengaluru. Daily budget 1000. WhatsApp 9876543210.",
  pageId: "123456789",
  adAccountId: "act_987654"
});

if (plan.ok && plan.meta.approvalToken) {
  const created = await client.realtor.createCampaign(
    {
      text: "3 BHK in Sarjapur, Bengaluru. Daily budget 1000. WhatsApp 9876543210.",
      pageId: "123456789",
      adAccountId: "act_987654"
    },
    {
      approvalToken: plan.meta.approvalToken,
      approvalReason: "approved by operator"
    }
  );
  console.log(created.data?.result?.reviewUrl);
}
```

## Guardrails

- Each response includes `meta.risk` and `meta.requiresApproval`.
- Medium/high-risk actions require approval token flow:
  1. `plan`
  2. `execute` with `approvalToken` (+ `approvalReason` for high-risk)
