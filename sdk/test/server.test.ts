import assert from "node:assert/strict";

import { createSocialFlowClient } from "../src/index.js";
import { createSdkStudioServer } from "../src/index.js";
import { MetaFetchExecutor } from "../src/index.js";

type Envelope<TData = unknown> = {
  ok: boolean;
  data: TData | null;
  error: { code: string; message: string } | null;
  meta: { risk: string; requiresApproval: boolean; approvalToken: string | null; approvalTokenExpiresAt: string | null; source: string };
};

async function startServer() {
  const server = createSdkStudioServer({
    port: 0,
    host: "127.0.0.1",
    configPath: "/tmp/social-flow-sdk-test-config.json"
  });
  const port = await server.start();
  return { server, port, baseUrl: `http://127.0.0.1:${port}` };
}

async function run() {
  const { server, baseUrl } = await startServer();
  try {
    // Keyless: no gateway key header sent, server must not require it.
    {
      const health = await fetch(`${baseUrl}/api/health`);
      assert.equal(health.status, 200);
      const body = (await health.json()) as { ok: boolean; keyless: boolean };
      assert.equal(body.ok, true);
      assert.equal(body.keyless, true);
    }

    // Studio index served at /.
    {
      const index = await fetch(`${baseUrl}/`);
      assert.equal(index.status, 200);
      const html = await index.text();
      assert.match(html, /Social Flow SDK Studio/);
      assert.match(html, /realtor-text/);
    }

    // Studio app.js served.
    {
      const app = await fetch(`${baseUrl}/app.js`);
      assert.equal(app.status, 200);
      const js = await app.text();
      assert.match(js, /sdkExecute/);
    }

    // GET /api/sdk/actions lists realtor actions keylessly.
    {
      const client = createSocialFlowClient({ baseUrl });
      const actions = await client.listActions();
      assert.equal(actions.ok, true);
      const list = actions.data?.actions || [];
      const realtorActions = list.filter((a) => a.action.startsWith("realtor_"));
      assert.ok(realtorActions.length >= 9);
      const create = realtorActions.find((a) => a.action === "realtor_create_campaign");
      assert.equal(create?.risk, "HIGH");
      assert.equal(create?.requiresApproval, true);
      const build = realtorActions.find((a) => a.action === "realtor_build");
      assert.equal(build?.risk, "LOW");
      const ingest = realtorActions.find((a) => a.action === "realtor_ingest");
      assert.equal(ingest?.risk, "LOW");
      assert.equal(ingest?.requiresApproval, false);
    }

    // Realtor build works keyless with zero config (no token needed).
    {
      const client = createSocialFlowClient({ baseUrl });
      const brief = await client.realtor.build({
        text: "3 BHK in Sarjapur, Bengaluru for ₹1.2 crore. Ready to move. Daily budget ₹1000. WhatsApp 9876543210."
      });
      assert.equal(brief.ok, true);
      const formatted = brief.data?.formatted as string | undefined;
      assert.ok(formatted && formatted.includes("Sarjapur"));
      assert.ok(brief.data?.compliance);
      const scopes = (brief.data?.compliance as { scopes?: string[] }).scopes || [];
      assert.ok(scopes.length > 0);
    }

    // Realtor preview builds payloads keyless.
    {
      const client = createSocialFlowClient({ baseUrl });
      const preview = await client.realtor.preview({
        text: "3 BHK in Sarjapur, Bengaluru for ₹1.2 crore. Daily budget ₹1000. WhatsApp 9876543210.",
        pageId: "123",
        adAccountId: "act_456",
        advantageAudience: 0
      });
      assert.equal(preview.ok, true);
      const payloads = preview.data?.payloads as Record<string, unknown> | undefined;
      assert.ok(payloads);
      assert.ok(payloads.campaign);
      assert.ok(payloads.adSet);
      assert.ok(payloads.creative);
      assert.ok(payloads.ad);
    }

    // Approval flow: HIGH-risk create campaign requires plan -> token -> reason.
    {
      const client = createSocialFlowClient({ baseUrl });
      const plan = await client.actions.plan("realtor_create_campaign", {
        text: "3 BHK Sarjapur Bengaluru",
        pageId: "123",
        adAccountId: "act_456",
        whatsappNumber: "+919876543210"
      });
      assert.equal(plan.ok, true);
      assert.equal(plan.data?.risk, "HIGH");
      assert.equal(plan.data?.requiresApproval, true);
      const token = plan.meta.approvalToken || "";
      assert.ok(token.startsWith("ap_"));

      // Execute without token -> 428 APPROVAL_REQUIRED.
      const missing = await client.realtor.createCampaign({
        text: "3 BHK Sarjapur Bengaluru",
        pageId: "123",
        adAccountId: "act_456",
        whatsappNumber: "+919876543210"
      });
      assert.equal(missing.ok, false);
      assert.equal(missing.error?.code, "APPROVAL_REQUIRED");
      assert.equal(missing.meta.requiresApproval, true);

      // Execute with token but no reason -> APPROVAL_REASON_REQUIRED (HIGH risk).
      const noReason = await client.realtor.createCampaign(
        {
          text: "3 BHK Sarjapur Bengaluru",
          pageId: "123",
          adAccountId: "act_456",
          whatsappNumber: "+919876543210"
        },
        { approvalToken: token }
      );
      assert.equal(noReason.ok, false);
      assert.equal(noReason.error?.code, "APPROVAL_REASON_REQUIRED");
    }

    // CAPI event requires approval (MEDIUM).
    {
      const client = createSocialFlowClient({ baseUrl });
      const plan = await client.actions.plan("realtor_capi", { eventName: "Lead", adAccountId: "act_456" });
      assert.equal(plan.ok, true);
      assert.equal(plan.data?.requiresApproval, true);
    }

    // Realtor ingest is LOW risk, keyless, and validates URL before any browser work.
    {
      const client = createSocialFlowClient({ baseUrl });
      const invalid = await client.realtor.ingest({ url: "not-a-url" });
      assert.equal(invalid.ok, false);
      assert.match(invalid.error?.message || "", /Invalid listing URL/);
    }

    // Config endpoints: update defaults keylessly, persisted to file.
    {
      const config = await fetch(`${baseUrl}/api/config`);
      assert.equal(config.status, 200);
      const update = await fetch(`${baseUrl}/api/config/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokens: { facebook: "EAAG_TEST_TOKEN" }, defaults: { facebookPageId: "page_1", marketingAdAccountId: "act_9" } })
      });
      assert.equal(update.status, 200);
      const updatedBody = (await update.json()) as { ok: boolean; config: { defaults: { facebookPageId: string; marketingAdAccountId: string } } };
      assert.equal(updatedBody.ok, true);
      assert.equal(updatedBody.config.defaults.facebookPageId, "page_1");
      assert.equal(updatedBody.config.defaults.marketingAdAccountId, "act_9");
    }

    // Status endpoint reports keyless + config defaults.
    {
      const client = createSocialFlowClient({ baseUrl });
      const status = await client.status();
      assert.equal(status.ok, true);
      assert.equal(status.data?.keyless, true);
    }

    // MetaFetchExecutor retry semantics + URL construction (no network call).
    {
      const config = { token: "t", graphVersion: "v26.0", scopes: [] };
      const executor = new MetaFetchExecutor(config, (async () => {
        return {
          ok: true,
          status: 200,
          json: async () => ({ name: "Test User" })
        } as Response;
      }) as typeof fetch);
      const me = await executor.get("me", { fields: "id,name" });
      assert.equal(me.name, "Test User");
    }

    // eslint-disable-next-line no-console
    console.log("ok - sdk server tests");
  } finally {
    await server.stop();
  }
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});

export type { Envelope };
