"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports._private = exports.LEAD_FORM_QUESTION_TYPES = void 0;
exports.buildLeadFormPayload = buildLeadFormPayload;
exports.defaultQuestions = defaultQuestions;
exports.createLeadForm = createLeadForm;
exports.fetchLeads = fetchLeads;
exports.LEAD_FORM_QUESTION_TYPES = [
    "CUSTOM",
    "FULL_NAME",
    "PHONE",
    "EMAIL",
    "WHATSAPP_ACCOUNT",
    "POSTAL_CODE",
    "STREET_ADDRESS",
    "DATE_TIME"
];
function buildLeadFormPayload(name, opts) {
    const payload = {
        name,
        privacy_policy: { url: opts.privacyPolicyUrl },
        context_type: opts.contextType || "PAGE"
    };
    const questions = opts.questions && opts.questions.length ? opts.questions : defaultQuestions();
    payload.questions = questions;
    if (opts.followUpActionUrl) {
        payload.follow_up_action_url = opts.followUpActionUrl;
    }
    if (opts.optimizedForQuality !== undefined) {
        payload.is_optimized_for_quality = opts.optimizedForQuality;
    }
    if (opts.locale) {
        payload.locale = opts.locale;
    }
    return payload;
}
function defaultQuestions() {
    return [
        { type: "FULL_NAME" },
        { type: "PHONE" },
        { type: "EMAIL" }
    ];
}
async function createLeadForm(executor, config, pageId, name, opts) {
    const normalizedPageId = String(pageId || config.defaultPageId || "").trim();
    if (!normalizedPageId) {
        throw new Error("No Page ID configured. Provide one or run `social onboard`.");
    }
    const payload = buildLeadFormPayload(name, opts);
    const params = {};
    for (const [key, value] of Object.entries(payload)) {
        if (value === undefined || value === null)
            continue;
        params[key] = typeof value === "string" ? value : JSON.stringify(value);
    }
    const result = await executor.post(`${normalizedPageId}/leadgen_forms`, params);
    const formId = String(result.id || "");
    if (!formId)
        throw new Error("Lead form creation returned no id.");
    return {
        formId,
        pageId: normalizedPageId,
        name,
        reviewUrl: `https://www.facebook.com/business/lead-gen-tool/pages/${normalizedPageId}`
    };
}
async function fetchLeads(executor, config, opts = {}) {
    const path = opts.adId || String(opts.adAccountId || config.defaultAdAccountId || "").trim();
    if (!path)
        throw new Error("No ad ID or ad account ID provided to fetch leads.");
    const params = { limit: String(opts.limit || 25) };
    if (opts.startTime)
        params.start_time = String(opts.startTime);
    if (opts.endTime)
        params.end_time = String(opts.endTime);
    const result = await executor.get(`${path}/leads`, params);
    const rows = Array.isArray(result.data) ? result.data : [];
    return rows.map((row) => {
        const rawFields = Array.isArray(row.field_data) ? row.field_data : [];
        const fields = {};
        for (const entry of rawFields) {
            const entryObj = entry;
            const label = String(entryObj.name || "");
            const values = Array.isArray(entryObj.values) ? entryObj.values : [];
            fields[label] = values.join(", ");
        }
        return {
            id: String(row.id || ""),
            createdTime: String(row.created_time || ""),
            adId: String(row.ad_id || ""),
            formId: String(row.form_id || ""),
            fields,
            fieldLabels: rawFields.map((entry) => String(entry.name || ""))
        };
    });
}
exports._private = {
    buildLeadFormPayload,
    defaultQuestions,
    createLeadForm,
    fetchLeads
};
