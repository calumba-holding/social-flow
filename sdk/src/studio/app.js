(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var nodes = {
    statusPill: $("status-pill"),
    serverPill: $("server-pill"),
    refreshAll: $("refresh-all"),
    setupForm: $("setup-form"),
    setupToken: $("setup-token"),
    setupPageId: $("setup-page-id"),
    setupAdAccount: $("setup-ad-account"),
    setupStatus: $("setup-status"),
    realtorForm: $("realtor-form"),
    realtorText: $("realtor-text"),
    realtorIngestUrl: $("realtor-ingest-url"),
    realtorIngest: $("realtor-ingest"),
    realtorIngestStatus: $("realtor-ingest-status"),
    realtorBudget: $("realtor-budget"),
    realtorDestination: $("realtor-destination"),
    realtorStatus: $("realtor-status"),
    realtorAdvantageAudience: $("realtor-advantage-audience"),
    realtorAdvantagePlus: $("realtor-advantage-plus"),
    realtorPageId: $("realtor-page-id"),
    realtorAdAccount: $("realtor-ad-account"),
    realtorWhatsapp: $("realtor-whatsapp"),
    realtorLeadForm: $("realtor-lead-form"),
    realtorImage: $("realtor-image"),
    realtorBuild: $("realtor-build"),
    realtorPreview: $("realtor-preview"),
    realtorCreate: $("realtor-create"),
    realtorReport: $("realtor-report"),
    realtorCompliance: $("realtor-compliance"),
    realtorBrief: $("realtor-brief"),
    realtorPayload: $("realtor-payload"),
    realtorResult: $("realtor-result"),
    realtorReportOutput: $("realtor-report-output"),
    realtorLfName: $("realtor-lf-name"),
    realtorLfPrivacy: $("realtor-lf-privacy"),
    realtorLfOptimize: $("realtor-lf-optimize"),
    realtorCreateLf: $("realtor-create-lf"),
    realtorLfOutput: $("realtor-lf-output"),
    realtorLeadsAdId: $("realtor-leads-ad-id"),
    realtorLeadsDays: $("realtor-leads-days"),
    realtorFetchLeads: $("realtor-fetch-leads"),
    realtorLeadsOutput: $("realtor-leads-output"),
    realtorCapiEvent: $("realtor-capi-event"),
    realtorCapiSource: $("realtor-capi-source"),
    realtorCapiEmail: $("realtor-capi-email"),
    realtorCapiPhone: $("realtor-capi-phone"),
    realtorSendCapi: $("realtor-send-capi"),
    realtorCapiOutput: $("realtor-capi-output"),
    actionLog: $("action-log")
  };

  var baseUrl = (window.location.protocol + "//" + window.location.host).replace(/\/$/, "");

  function setStatus(kind, text) {
    nodes.statusPill.textContent = text;
    nodes.statusPill.classList.remove("ok", "warn", "err");
    nodes.statusPill.classList.add(kind || "ok");
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function pretty(value) {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  function errorText(error, fallback) {
    const payload = error && typeof error === "object" && error.payload ? error.payload : error;
    const data = error && typeof error === "object" && error.data ? error.data : null;
    if (data && data.error && data.error.message) return data.error.message;
    if (payload && payload.error && payload.error.message) return payload.error.message;
    return String((error && error.message) || (error && error.error) || fallback || "Request failed");
  }

  async function requestApi(pathname, opts) {
    const options = opts || {};
    const response = await fetch(baseUrl + pathname, {
      method: options.method || "GET",
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok && !payload) {
      throw new Error("HTTP " + response.status);
    }
    return payload;
  }

  function withActions(action, fn) {
    return async function () {
      try {
        fn(true);
        await action();
      } catch (error) {
        setStatus("err", errorText(error));
      } finally {
        fn(false);
      }
    };
  }

  function busyOf(node) {
    return function (busy) {
      node.disabled = busy;
      node.classList.toggle("is-busy", busy);
    };
  }

  async function sdkExecute(action, params, opts) {
    const options = opts || {};
    let approvalToken = "";
    let approvalReason = "";
    if (options.requiresApproval) {
      const plan = await requestApi("/api/sdk/actions/plan", { method: "POST", body: { action: action, params: params } });
      approvalToken = String((plan && plan.data && plan.data.approvalToken) || (plan && plan.meta && plan.meta.approvalToken) || "");
      if (!approvalToken) throw new Error("No approval token issued for this action.");
      const reason = window.prompt("Approval reason for \"" + action + "\":");
      approvalReason = String(reason || "").trim();
      if (!approvalReason) throw new Error("Approval reason is required.");
    }
    const body = { action: action, params: params };
    if (approvalToken) body.approvalToken = approvalToken;
    if (approvalReason) body.approvalReason = approvalReason;
    const out = await requestApi("/api/sdk/actions/execute", { method: "POST", body: body });
    appendLog(action, out);
    if (out && out.error) {
      throw Object.assign(new Error(out.error.message || "Action failed"), { payload: out });
    }
    return out ? out.data || {} : {};
  }

  function appendLog(action, envelope) {
    const ok = Boolean(envelope && envelope.ok);
    const meta = envelope && envelope.meta ? envelope.meta : {};
    const line = "[" + new Date().toLocaleTimeString() + "] " + action
      + (ok ? " ok" : " FAILED")
      + (meta.risk ? " risk=" + meta.risk : "")
      + (meta.requiresApproval ? " approved" : "");
    const current = nodes.actionLog.textContent;
    nodes.actionLog.textContent = current === "No actions executed yet."
      ? line
      : line + "\n" + current;
  }

  function realtorRequestPayload() {
    const payload = { text: String(nodes.realtorText.value || "").trim() };
    const brief = {};
    const pageId = String(nodes.realtorPageId.value || "").trim();
    const adAccountId = String(nodes.realtorAdAccount.value || "").trim();
    const whatsappNumber = String(nodes.realtorWhatsapp.value || "").trim();
    const leadFormId = String(nodes.realtorLeadForm.value || "").trim();
    const image = String(nodes.realtorImage.value || "").trim();
    if (pageId) brief.pageId = pageId;
    if (adAccountId) brief.adAccountId = adAccountId;
    if (whatsappNumber) brief.whatsappNumber = whatsappNumber;
    if (leadFormId) brief.leadFormId = leadFormId;
    if (image) brief.image = image;
    payload.brief = brief;
    const budget = Number(nodes.realtorBudget.value);
    if (Number.isFinite(budget) && budget > 0) payload.dailyBudgetInr = budget;
    const destination = String(nodes.realtorDestination.value || "whatsapp").trim();
    if (destination) payload.destination = destination;
    const status = String(nodes.realtorStatus.value || "PAUSED").trim();
    if (status) payload.status = status;
    const advantageAudience = nodes.realtorAdvantageAudience.value;
    if (advantageAudience === "1" || advantageAudience === "0") payload.advantageAudience = Number(advantageAudience);
    if (nodes.realtorAdvantagePlus.value === "on") payload.advantagePlusLeads = true;
    return payload;
  }

  function renderCompliance(compliance) {
    if (!compliance) {
      nodes.realtorCompliance.textContent = "No compliance payload returned.";
      return;
    }
    const lines = [];
    if (Array.isArray(compliance.notice) && compliance.notice.length) {
      lines.push("Notice:");
      compliance.notice.forEach(function (line) { lines.push("  " + line); });
    }
    if (Array.isArray(compliance.scopes) && compliance.scopes.length) {
      lines.push("Required scopes:");
      compliance.scopes.forEach(function (scope) { lines.push("  " + scope); });
    }
    nodes.realtorCompliance.innerHTML = lines.length
      ? "<pre class=\"mono-block\">" + escapeHtml(lines.join("\n")) + "</pre>"
      : "Housing compliance details will appear here.";
  }

  async function loadRealtorScopes() {
    try {
      const data = await sdkExecute("realtor_scopes", {});
      renderCompliance(data && data.compliance ? data.compliance : data);
    } catch (error) {
      nodes.realtorCompliance.textContent = "Unable to load scopes: " + errorText(error);
    }
  }

  async function refreshHealth() {
    try {
      const health = await requestApi("/api/health");
      setStatus(health.ok ? "ok" : "err", health.ok ? "Connected (keyless)" : "Error");
      nodes.serverPill.textContent = baseUrl;
      nodes.serverPill.classList.add("ok");
    } catch (error) {
      setStatus("err", "Cannot reach SDK server");
      nodes.serverPill.textContent = baseUrl;
      nodes.serverPill.classList.add("err");
    }
  }

  async function loadSetup() {
    try {
      const out = await requestApi("/api/config");
      const config = out && out.config ? out.config : out;
      const defaults = config.defaults || {};
      if (config.tokens && config.tokens.facebook && config.tokens.facebook.configured) {
        nodes.setupToken.placeholder = "Saved: " + (config.tokens.facebook.preview || "••••") + " (leave blank to keep)";
      }
      if (defaults.facebookPageId) nodes.setupPageId.value = defaults.facebookPageId;
      if (defaults.marketingAdAccountId) nodes.setupAdAccount.value = defaults.marketingAdAccountId;
      if (out && out.readiness && !out.readiness.ok) {
        setStatus("warn", "Setup incomplete");
      }
    } catch (error) {
      nodes.setupStatus.textContent = "Unable to load setup: " + errorText(error);
    }
  }

  async function saveSetup(event) {
    if (event) event.preventDefault();
    const payload = {
      defaultApi: "facebook",
      tokens: {},
      defaults: {}
    };
    const token = String(nodes.setupToken.value || "").trim();
    const pageId = String(nodes.setupPageId.value || "").trim();
    const adAccountId = String(nodes.setupAdAccount.value || "").trim();
    if (token) payload.tokens.facebook = token;
    if (pageId) payload.defaults.facebookPageId = pageId;
    if (adAccountId) payload.defaults.marketingAdAccountId = adAccountId;
    nodes.setupStatus.textContent = "Saving…";
    try {
      const out = await requestApi("/api/config/update", { method: "POST", body: payload });
      nodes.setupStatus.textContent = out.ok ? "Setup saved." : errorText(out);
      nodes.setupToken.value = "";
      if (out.ok) {
        setStatus("ok", "Setup saved (keyless)");
        await loadSetup();
      }
    } catch (error) {
      nodes.setupStatus.textContent = "Save failed: " + errorText(error);
    }
  }

  async function realtorBuildBrief() {
    nodes.realtorBrief.textContent = "Building brief…";
    const out = await sdkExecute("realtor_build", realtorRequestPayload());
    nodes.realtorBrief.textContent = out.formatted || pretty(out);
    const missing = Array.isArray(out.missing) ? out.missing : [];
    renderCompliance(out.compliance);
    setStatus(missing.length ? "warn" : "ok", missing.length ? "Brief parsed. Missing: " + missing.join(", ") : "Brief parsed and complete.");
  }

  async function realtorIngestListing() {
    const url = String(nodes.realtorIngestUrl.value || "").trim();
    if (!url) {
      setStatus("err", "Paste a listing URL first.");
      return;
    }
    nodes.realtorIngestStatus.textContent = "Scraping listing… (may take ~15s)";
    try {
      const out = await sdkExecute("realtor_ingest", { url: url });
      nodes.realtorBrief.textContent = pretty({
        source: out.source,
        title: out.title,
        formatted: out.formatted,
        brief: out.brief,
        missing: out.missing,
        complete: out.complete,
        primaryImage: out.primaryImage
      });
      if (out.brief) {
        const brief = out.brief;
        if (brief.message) nodes.realtorText.value = brief.message;
        if (brief.price) nodes.realtorBudget.value = "";
        if (brief.image) nodes.realtorImage.value = brief.image;
        if (brief.pageId) nodes.realtorPageId.value = brief.pageId;
        if (brief.adAccountId) nodes.realtorAdAccount.value = brief.adAccountId;
        if (brief.whatsappNumber) nodes.realtorWhatsapp.value = brief.whatsappNumber;
      }
      const missing = Array.isArray(out.missing) ? out.missing : [];
      renderCompliance(out.compliance);
      setStatus(missing.length ? "warn" : "ok", missing.length ? "Listing ingested. Missing: " + missing.join(", ") : "Listing ingested.");
      nodes.realtorIngestStatus.textContent = "Ingested from " + (out.source || url) + ". Review the brief, then Build/Preview/Create.";
    } catch (error) {
      nodes.realtorIngestStatus.textContent = "Ingest failed.";
      throw error;
    }
  }

  async function realtorPreviewPayloads() {
    nodes.realtorPayload.textContent = "Building payloads…";
    const out = await sdkExecute("realtor_preview", realtorRequestPayload());
    const preview = {
      opts: out.opts,
      context: out.context,
      payloads: out.payloads,
      notes: out.payloads && out.payloads.notes ? out.payloads.notes : []
    };
    nodes.realtorPayload.textContent = pretty(preview);
    renderCompliance(out.compliance);
    setStatus("ok", "Payloads previewed.");
  }

  async function realtorCreateCampaign() {
    nodes.realtorResult.textContent = "Creating campaign…";
    const out = await sdkExecute("realtor_create_campaign", realtorRequestPayload(), { requiresApproval: true });
    nodes.realtorResult.textContent = pretty(out.result || out);
    renderCompliance(out.compliance);
    setStatus("ok", "Campaign created (paused).");
  }

  async function realtorFetchReport() {
    nodes.realtorReportOutput.textContent = "Fetching report…";
    const payload = realtorRequestPayload();
    const params = {
      adAccountId: String(payload.brief.adAccountId || ""),
      campaignId: "",
      preset: "last_7d",
      level: "campaign"
    };
    const out = await sdkExecute("realtor_report", params);
    const report = out.report || out;
    nodes.realtorReportOutput.textContent = pretty({
      account: report.account,
      preset: report.preset,
      totals: report.totals,
      narrative: report.narrative,
      recommendations: report.recommendations,
      rawCount: report.rawCount
    });
    renderCompliance(out.compliance);
    setStatus("ok", "Report fetched.");
  }

  async function realtorCreateLeadForm() {
    const payload = realtorRequestPayload();
    const brief = payload.brief || {};
    const body = {
      pageId: brief.pageId || "",
      name: String(nodes.realtorLfName.value || "").trim() || "Realtor lead form",
      privacyPolicyUrl: String(nodes.realtorLfPrivacy.value || "").trim()
    };
    nodes.realtorLfOutput.textContent = "Creating lead form…";
    const out = await sdkExecute("realtor_leadform", body, { requiresApproval: true });
    nodes.realtorLfOutput.textContent = "Created: " + pretty(out.result);
    setStatus("ok", "Lead form created.");
  }

  async function realtorFetchLeads() {
    const payload = realtorRequestPayload();
    const brief = payload.brief || {};
    const days = Math.max(1, Math.min(90, Number(nodes.realtorLeadsDays.value) || 7));
    const endTime = Math.floor(Date.now() / 1000);
    const startTime = endTime - days * 86400;
    const body = {
      adAccountId: String(nodes.realtorLeadsAdId.value || brief.adAccountId || ""),
      adId: "",
      startTime: startTime,
      endTime: endTime,
      limit: 25
    };
    nodes.realtorLeadsOutput.textContent = "Fetching leads…";
    const out = await sdkExecute("realtor_leads", body);
    nodes.realtorLeadsOutput.textContent = out.count + " leads";
    nodes.realtorReportOutput.textContent = pretty(out.leads || []);
    setStatus("ok", "Leads fetched.");
  }

  async function realtorSendCapi() {
    const payload = realtorRequestPayload();
    const brief = payload.brief || {};
    const body = {
      adAccountId: String(brief.adAccountId || ""),
      eventName: String(nodes.realtorCapiEvent.value || "Lead"),
      eventSourceUrl: String(nodes.realtorCapiSource.value || "").trim() || undefined,
      userData: {}
    };
    const email = String(nodes.realtorCapiEmail.value || "").trim();
    const phone = String(nodes.realtorCapiPhone.value || "").trim();
    if (email) body.userData.email = email;
    if (phone) body.userData.phone = phone;
    nodes.realtorCapiOutput.textContent = "Sending CAPI event…";
    const out = await sdkExecute("realtor_capi", body, { requiresApproval: true });
    nodes.realtorCapiOutput.textContent = "Sent: " + pretty(out.result);
    setStatus("ok", "CAPI event sent.");
  }

  function bindEvents() {
    nodes.refreshAll.addEventListener("click", function () { refreshHealth(); loadSetup(); loadRealtorScopes(); });
    nodes.setupForm.addEventListener("submit", saveSetup);
    nodes.realtorBuild.addEventListener("click", withActions(realtorBuildBrief, busyOf(nodes.realtorBuild)));
    nodes.realtorIngest.addEventListener("click", withActions(realtorIngestListing, busyOf(nodes.realtorIngest)));
    nodes.realtorPreview.addEventListener("click", withActions(realtorPreviewPayloads, busyOf(nodes.realtorPreview)));
    nodes.realtorCreate.addEventListener("click", withActions(realtorCreateCampaign, busyOf(nodes.realtorCreate)));
    nodes.realtorReport.addEventListener("click", withActions(realtorFetchReport, busyOf(nodes.realtorReport)));
    nodes.realtorCreateLf.addEventListener("click", withActions(realtorCreateLeadForm, busyOf(nodes.realtorCreateLf)));
    nodes.realtorFetchLeads.addEventListener("click", withActions(realtorFetchLeads, busyOf(nodes.realtorFetchLeads)));
    nodes.realtorSendCapi.addEventListener("click", withActions(realtorSendCapi, busyOf(nodes.realtorSendCapi)));
  }

  async function init() {
    bindEvents();
    refreshHealth();
    loadSetup();
    loadRealtorScopes();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
