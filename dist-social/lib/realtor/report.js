"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports._private = exports.LEAD_ACTION_TYPES = exports.INSIGHT_FIELDS = void 0;
exports.summarizeInsightRow = summarizeInsightRow;
exports.aggregateTotals = aggregateTotals;
exports.explainTotals = explainTotals;
exports.buildReport = buildReport;
exports.fetchCampaignReport = fetchCampaignReport;
const campaign_js_1 = require("./campaign.js");
exports.INSIGHT_FIELDS = "spend,impressions,clicks,reach,cpc,cpm,ctr,actions,cost_per_action_type";
exports.LEAD_ACTION_TYPES = new Set([
    "lead",
    "onsite_conversion.lead_grouped",
    "onsite_conversion.lead",
    "link_click_to_whatsapp_button",
    "messaging_conversation_started_7d",
    "messaging_conversation_started_1d",
    "offsite_conversion.fb_pixel_lead"
]);
function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}
function sumActionType(actions, type) {
    if (!Array.isArray(actions))
        return 0;
    const action = actions.find((entry) => entry.action_type === type);
    return action ? toNumber(action.value) : 0;
}
function leadsFromActions(actions) {
    if (!Array.isArray(actions))
        return 0;
    return actions.reduce((total, entry) => {
        if (entry.action_type && exports.LEAD_ACTION_TYPES.has(entry.action_type)) {
            return total + toNumber(entry.value);
        }
        return total;
    }, 0);
}
function summarizeInsightRow(row) {
    const spend = toNumber(row.spend);
    const impressions = toNumber(row.impressions);
    const clicks = toNumber(row.clicks);
    const reach = toNumber(row.reach);
    const leads = leadsFromActions(row.actions);
    const whatsappConversations = sumActionType(row.actions, "messaging_conversation_started_7d") +
        sumActionType(row.actions, "messaging_conversation_started_1d") +
        sumActionType(row.actions, "link_click_to_whatsapp_button");
    return {
        id: String(row.campaign_id || row.adset_id || row.ad_id || ""),
        name: String(row.campaign_name || row.adset_name || row.ad_name || ""),
        status: row.status ? String(row.status) : undefined,
        spend,
        impressions,
        clicks,
        reach,
        leads,
        whatsappConversations,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
        cpl: leads > 0 ? spend / leads : 0
    };
}
function aggregateTotals(rows) {
    const totals = {
        spend: 0,
        impressions: 0,
        clicks: 0,
        reach: 0,
        leads: 0,
        whatsappConversations: 0,
        ctr: 0,
        cpc: 0,
        cpm: 0,
        cpl: 0
    };
    for (const row of rows) {
        totals.spend += row.spend || 0;
        totals.impressions += row.impressions || 0;
        totals.clicks += row.clicks || 0;
        totals.reach += row.reach || 0;
        totals.leads += row.leads || 0;
        totals.whatsappConversations += row.whatsappConversations || 0;
    }
    if (totals.impressions > 0)
        totals.ctr = (totals.clicks / totals.impressions) * 100;
    if (totals.clicks > 0)
        totals.cpc = totals.spend / totals.clicks;
    if (totals.impressions > 0)
        totals.cpm = (totals.spend / totals.impressions) * 1000;
    if (totals.leads > 0)
        totals.cpl = totals.spend / totals.leads;
    return totals;
}
function inr(value) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
    }).format(value);
}
function explainTotals(totals, dailyBudgetInr = 0) {
    const narrative = [];
    const recommendations = [];
    if (totals.impressions === 0) {
        narrative.push("No impressions were delivered in this period.");
        recommendations.push("Check campaign status, ad account approval, and whether the audience size is large enough.");
        recommendations.push("Confirm the ad was not rejected under the HOUSING special ad category.");
        return { narrative, recommendations };
    }
    narrative.push(`${inr(totals.spend)} spent · ${totals.impressions.toLocaleString("en-IN")} impressions · ${totals.reach.toLocaleString("en-IN")} reach · ${totals.clicks.toLocaleString("en-IN")} clicks`);
    narrative.push(`CTR ${totals.ctr.toFixed(2)}% · CPC ${inr(totals.cpc)} · CPM ${inr(totals.cpm)}`);
    if (totals.leads > 0) {
        narrative.push(`Leads: ${totals.leads} (CPL ${inr(totals.cpl)}) · WhatsApp conversations: ${totals.whatsappConversations}`);
    }
    else {
        narrative.push("No leads/conversations captured in this period.");
    }
    if (totals.ctr < 0.8) {
        recommendations.push(`CTR is low (${totals.ctr.toFixed(2)}%). Refresh the ad creative and message, and target a warmer audience.`);
    }
    else if (totals.ctr >= 2) {
        recommendations.push(`Strong CTR (${totals.ctr.toFixed(2)}%) — the creative resonates. Consider scaling the daily budget.`);
    }
    if (totals.leads === 0 && totals.clicks > 0) {
        recommendations.push("Clicks are happening but no leads — verify the WhatsApp number / lead form is connected and the landing experience loads.");
    }
    if (totals.leads > 0) {
        if (dailyBudgetInr > 0 && totals.cpl > dailyBudgetInr) {
            recommendations.push(`CPL (${inr(totals.cpl)}) exceeds the daily budget (${inr(dailyBudgetInr)}) — tighten targeting or improve the offer.`);
        }
        if (totals.cpl <= dailyBudgetInr / 2) {
            recommendations.push(`CPL is efficient (${inr(totals.cpl)}) — strong candidate for budget increase.`);
        }
    }
    return { narrative, recommendations };
}
function buildReport(totals, rows, options = {}) {
    const dailyBudgetInr = options.preset === "last_30d" ? 0 : 0;
    const explained = explainTotals(totals, dailyBudgetInr);
    return {
        account: "",
        preset: options.preset || "custom",
        totals,
        rows,
        narrative: explained.narrative,
        recommendations: explained.recommendations,
        rawCount: rows.length
    };
}
async function fetchCampaignReport(executor, config, adAccountId, campaignId = "", options = {}) {
    const account = (0, campaign_js_1.normalizeAdAccountId)(adAccountId || config.defaultAdAccountId || "");
    if (!account)
        throw new Error("No ad account ID configured. Provide one or run `social onboard`.");
    const preset = options.preset || "last_7d";
    const params = {
        fields: exports.INSIGHT_FIELDS,
        date_preset: preset,
        level: options.level || "campaign",
        limit: String(options.limit || 20)
    };
    if (options.since && options.until) {
        delete params.date_preset;
        params.since = options.since;
        params.until = options.until;
    }
    const result = await executor.get(campaignId ? `${campaignId}/insights` : `${account}/insights`, params);
    const rows = Array.isArray(result.data) ? result.data : [];
    const summarized = rows.map((row) => summarizeInsightRow(row));
    const totals = aggregateTotals(summarized);
    return {
        account,
        preset,
        totals,
        rows: summarized,
        narrative: explainTotals(totals).narrative,
        recommendations: explainTotals(totals).recommendations,
        rawCount: rows.length
    };
}
exports._private = {
    aggregateTotals,
    buildReport,
    explainTotals,
    leadsFromActions,
    summarizeInsightRow
};
