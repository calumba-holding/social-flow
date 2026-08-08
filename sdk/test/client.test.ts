import assert from "node:assert/strict";

import { createSocialFlowClient } from "../src/index.js";

type MockCall = {
  url: string;
  method: string;
  body: unknown;
};

function mockFetchFactory(resolver: (call: MockCall) => unknown) {
  const calls: MockCall[] = [];
  const mockFetch: typeof fetch = (async (input, init) => {
    const url = String(input);
    const method = String(init?.method || "GET");
    const bodyText = typeof init?.body === "string" ? init.body : "";
    const body = bodyText ? JSON.parse(bodyText) : null;
    const call = { url, method, body };
    calls.push(call);
    const payload = resolver(call);
    return {
      ok: true,
      status: 200,
      json: async () => payload
    } as Response;
  }) as typeof fetch;
  return { mockFetch, calls };
}

async function run() {
  {
    const { mockFetch, calls } = mockFetchFactory((call) => {
      if (call.url.endsWith("/api/sdk/actions/plan")) {
        return {
          ok: true,
          traceId: "sdk_trace_plan",
          data: {
            planned: true,
            action: "create_post",
            params: call.body && typeof call.body === "object" ? (call.body as Record<string, unknown>).params : {},
            risk: "MEDIUM",
            requiresApproval: true,
            approvalToken: "ap_test",
            approvalTokenExpiresAt: "2030-01-01T00:00:00.000Z"
          },
          error: null,
          meta: {
            action: "create_post",
            risk: "MEDIUM",
            requiresApproval: true,
            approvalToken: "ap_test",
            approvalTokenExpiresAt: "2030-01-01T00:00:00.000Z",
            source: "gateway-sdk"
          }
        };
      }
      if (call.url.endsWith("/api/sdk/actions/execute")) {
        return {
          ok: true,
          traceId: "sdk_trace_exec",
          data: { postId: "post_123" },
          error: null,
          meta: {
            action: "create_post",
            risk: "MEDIUM",
            requiresApproval: true,
            approvalToken: null,
            approvalTokenExpiresAt: null,
            source: "gateway-sdk"
          }
        };
      }
      return {
        ok: false,
        traceId: "sdk_unknown",
        data: null,
        error: { code: "NOT_FOUND", message: "Not found", retryable: false, suggestedNextCommand: "" },
        meta: {
          action: "unknown",
          risk: "",
          requiresApproval: false,
          approvalToken: null,
          approvalTokenExpiresAt: null,
          source: "gateway-sdk"
        }
      };
    });

    const client = createSocialFlowClient({
      baseUrl: "http://127.0.0.1:1310",
      gatewayKey: "k_test",
      fetchImpl: mockFetch
    });

    const plan = await client.actions.plan("create_post", { message: "Hello", pageId: "123" });
    assert.equal(plan.ok, true);
    assert.equal(plan.data?.requiresApproval, true);
    assert.equal(plan.meta.approvalToken, "ap_test");

    const exec = await client.actions.execute(
      "create_post",
      { message: "Hello", pageId: "123" },
      { approvalToken: String(plan.meta.approvalToken || ""), approvalReason: "approved by operator" }
    );
    assert.equal(exec.ok, true);
    assert.equal(exec.data?.postId, "post_123");

    const executeCall = calls.find((x) => x.url.endsWith("/api/sdk/actions/execute"));
    assert.ok(executeCall);
    assert.equal((executeCall?.body as Record<string, unknown>)?.approvalToken, "ap_test");
  }

  {
    const { mockFetch } = mockFetchFactory(() => ({
      ok: true,
      traceId: "sdk_status",
      data: { service: "social-api-gateway" },
      error: null,
      meta: {
        action: "status",
        risk: "LOW",
        requiresApproval: false,
        approvalToken: null,
        approvalTokenExpiresAt: null,
        source: "gateway-sdk"
      }
    }));
    const client = createSocialFlowClient({
      baseUrl: "http://127.0.0.1:1310",
      fetchImpl: mockFetch
    });
    const status = await client.health.status();
    assert.equal(status.ok, true);
    assert.equal(status.data?.service, "social-api-gateway");
  }

  {
    const { mockFetch, calls } = mockFetchFactory((call) => {
      if (call.url.endsWith("/api/sdk/actions/plan")) {
        return {
          ok: true,
          traceId: "sdk_trace_realtor_plan",
          data: {
            planned: true,
            action: "realtor_create_campaign",
            params: call.body && typeof call.body === "object" ? (call.body as Record<string, unknown>).params : {},
            risk: "HIGH",
            requiresApproval: true,
            approvalToken: "ap_realtor",
            approvalTokenExpiresAt: "2030-01-01T00:00:00.000Z"
          },
          error: null,
          meta: {
            action: "realtor_create_campaign",
            risk: "HIGH",
            requiresApproval: true,
            approvalToken: "ap_realtor",
            approvalTokenExpiresAt: "2030-01-01T00:00:00.000Z",
            source: "gateway-sdk"
          }
        };
      }
      if (call.url.endsWith("/api/sdk/actions/execute")) {
        const body = call.body && typeof call.body === "object" ? (call.body as Record<string, unknown>) : {};
        if (body.action === "realtor_preview") {
          return {
            ok: true,
            traceId: "sdk_trace_preview",
            data: { payloads: { adSet: { targeting_automation: { advantage_audience: 0 } } } },
            error: null,
            meta: {
              action: "realtor_preview",
              risk: "LOW",
              requiresApproval: false,
              approvalToken: null,
              approvalTokenExpiresAt: null,
              source: "gateway-sdk"
            }
          };
        }
        return {
          ok: true,
          traceId: "sdk_trace_realtor_exec",
          data: { result: { campaignId: "camp_1", adSetId: "set_1" } },
          error: null,
          meta: {
            action: "realtor_create_campaign",
            risk: "HIGH",
            requiresApproval: true,
            approvalToken: null,
            approvalTokenExpiresAt: null,
            source: "gateway-sdk"
          }
        };
      }
      return {
        ok: false,
        traceId: "sdk_unknown",
        data: null,
        error: { code: "NOT_FOUND", message: "Not found", retryable: false, suggestedNextCommand: "" },
        meta: {
          action: "unknown",
          risk: "",
          requiresApproval: false,
          approvalToken: null,
          approvalTokenExpiresAt: null,
          source: "gateway-sdk"
        }
      };
    });

    const client = createSocialFlowClient({
      baseUrl: "http://127.0.0.1:1310",
      gatewayKey: "k_test",
      fetchImpl: mockFetch
    });

    const preview = await client.realtor.preview({
      text: "3 BHK Sarjapur Bengaluru",
      dailyBudgetInr: 1000,
      advantageAudience: 0
    });
    assert.equal(preview.ok, true);
    assert.equal(preview.meta.requiresApproval, false);

    const plan = await client.actions.plan("realtor_create_campaign", {
      text: "3 BHK Sarjapur Bengaluru",
      pageId: "123",
      adAccountId: "act_1",
      whatsappNumber: "+919876543210"
    });
    assert.equal(plan.ok, true);
    assert.equal(plan.meta.risk, "HIGH");
    assert.equal(plan.meta.requiresApproval, true);
    assert.equal(plan.meta.approvalToken, "ap_realtor");

    const created = await client.realtor.createCampaign(
      {
        text: "3 BHK Sarjapur Bengaluru",
        pageId: "123",
        adAccountId: "act_1",
        whatsappNumber: "+919876543210"
      },
      { approvalToken: String(plan.meta.approvalToken || ""), approvalReason: "approved by operator" }
    );
    assert.equal(created.ok, true);
    assert.equal((created.data?.result as { campaignId?: string } | undefined)?.campaignId, "camp_1");

    const createCall = calls.find((x) => x.url.endsWith("/api/sdk/actions/execute") && (x.body as Record<string, unknown>)?.action === "realtor_create_campaign");
    assert.ok(createCall);
    assert.equal((createCall?.body as Record<string, unknown>)?.approvalToken, "ap_realtor");
  }

  // eslint-disable-next-line no-console
  console.log("ok - sdk client tests");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
