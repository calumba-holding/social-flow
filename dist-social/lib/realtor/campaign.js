"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports._private = void 0;
exports.inrToMinorUnits = inrToMinorUnits;
exports.normalizeAdAccountId = normalizeAdAccountId;
exports.normalizePageId = normalizePageId;
exports.buildCampaignPayload = buildCampaignPayload;
exports.buildAdSetPayload = buildAdSetPayload;
exports.buildCreativePayload = buildCreativePayload;
exports.buildAdPayload = buildAdPayload;
exports.buildAllPayloads = buildAllPayloads;
exports.payloadToParams = payloadToParams;
exports.resolveCityTargeting = resolveCityTargeting;
exports.uploadImageByUrl = uploadImageByUrl;
exports.createHousingCampaign = createHousingCampaign;
const compliance_js_1 = require("./compliance.js");
function inrToMinorUnits(amountInr) {
    return Math.round(amountInr * 100);
}
function normalizeAdAccountId(value) {
    const raw = String(value || "").trim();
    if (!raw)
        return raw;
    return raw.startsWith("act_") ? raw : `act_${raw}`;
}
function normalizePageId(value) {
    return String(value || "").trim();
}
function sanitizeAccount(config, adAccountId) {
    return normalizeAdAccountId(adAccountId || config.defaultAdAccountId || "");
}
function campaignNameFor(context, opts) {
    if (opts.campaignName)
        return opts.campaignName;
    const base = context.projectName || context.city || "Real estate";
    return `[REALTOR] ${base} · ${opts.destination || "whatsapp"}`;
}
function leadGenObjective(destination) {
    return destination === "whatsapp" ? "CONVERSATIONS" : "LEAD_GENERATION";
}
function buildCampaignPayload(context, opts = {}) {
    const category = (0, compliance_js_1.housingCategoryPayload)();
    const payload = {
        name: campaignNameFor(context, opts),
        objective: opts.objective || "OUTCOME_LEADS",
        status: opts.status || "PAUSED",
        special_ad_categories: category.special_ad_categories,
        special_ad_category_country: category.special_ad_category_country
    };
    if (context.leadFormId && (opts.destination ?? "whatsapp") === "lead_form") {
        payload.lead_gen_form_id = context.leadFormId;
    }
    return payload;
}
function buildAdSetPayload(context, opts = {}, campaignId = "") {
    const dailyBudgetInr = opts.dailyBudgetInr || 500;
    const destination = opts.destination || "whatsapp";
    const targetingBase = {
        geo_locations: {
            countries: [compliance_js_1.COMPLIANCE_COUNTRY]
        }
    };
    if (context.cityKey && context.city) {
        targetingBase.geo_locations.cities = [
            { key: context.cityKey, name: context.city, country_code: compliance_js_1.COMPLIANCE_COUNTRY, radius: 50, distance_unit: "km" }
        ];
    }
    const compliance = (0, compliance_js_1.sanitizeTargetingForHousing)(targetingBase);
    const promotedObject = { page_id: normalizePageId(context.pageId) };
    if (destination === "whatsapp" && context.whatsappNumber) {
        promotedObject.whatsapp_phone_number = context.whatsappNumber;
    }
    const payload = {
        name: `[REALTOR] Ad set · ${context.city || "India"} · ${destination}`,
        campaign_id: campaignId,
        billing_event: "IMPRESSIONS",
        optimization_goal: leadGenObjective(destination),
        bid_strategy: "LOWEST_COST_WITHOUT_CAP",
        daily_budget: String(inrToMinorUnits(dailyBudgetInr)),
        targeting: (0, compliance_js_1.encodeTargetingForApi)(compliance.clean),
        targeting_automation: { advantage_audience: opts.advantageAudience ?? 0 },
        promoted_object: (0, compliance_js_1.encodeTargetingForApi)(promotedObject),
        status: opts.status || "PAUSED"
    };
    if (opts.advantagePlusLeads) {
        payload.advantage_state = "ADVANTAGE_PLUS_LEADS";
        payload.advantage_budget_state = "ENABLED";
        payload.advantage_audience_state = "ENABLED";
        payload.advantage_placement_state = "ENABLED";
        delete payload.bid_strategy;
    }
    if (destination === "whatsapp") {
        payload.destination_type = "WHATSAPP";
    }
    else {
        payload.destination_type = "ON_AD";
    }
    return payload;
}
function buildCreativePayload(context, opts = {}, imageHash = "") {
    const destination = opts.destination || "whatsapp";
    const message = context.projectName
        ? `Explore ${context.projectName}${context.city ? ` in ${context.city}` : ""}. Connect on WhatsApp for details.`
        : `Explore premium real estate${context.city ? ` in ${context.city}` : ""}. Connect on WhatsApp for details.`;
    const linkData = {
        message,
        link: destination === "whatsapp"
            ? `https://wa.me/${(context.whatsappNumber || "").replace(/\+/g, "")}?text=${encodeURIComponent("Hi, I'm interested in this property.")}`
            : "https://www.facebook.com/",
        call_to_action: {
            type: destination === "whatsapp" ? "WHATSAPP_MESSAGE" : "LEARN_MORE"
        }
    };
    if (imageHash) {
        linkData.image_hash = imageHash;
    }
    return {
        name: `[REALTOR] Creative · ${context.city || "India"} · ${destination}`,
        object_story_spec: (0, compliance_js_1.encodeTargetingForApi)({
            page_id: normalizePageId(context.pageId),
            link_data: linkData
        })
    };
}
function buildAdPayload(context, opts = {}, adSetId = "", creativeId = "") {
    return {
        name: `[REALTOR] Ad · ${context.city || "India"} · ${opts.destination || "whatsapp"}`,
        adset_id: adSetId,
        creative: (0, compliance_js_1.encodeTargetingForApi)({ creative_id: creativeId }),
        status: opts.status || "PAUSED"
    };
}
function buildAllPayloads(context, opts = {}) {
    const campaign = buildCampaignPayload(context, opts);
    const adSet = buildAdSetPayload(context, opts);
    const creative = buildCreativePayload(context, opts);
    const ad = buildAdPayload(context, opts);
    const notes = [];
    notes.push(`Daily budget: ${opts.dailyBudgetInr || 500} INR (${inrToMinorUnits(opts.dailyBudgetInr || 500)} minor units).`);
    notes.push(`Destination: ${opts.destination || "whatsapp"}.`);
    if (context.city && !context.cityKey) {
        notes.push(`City "${context.city}" was not resolved to a Meta geo key — targeting falls back to country ${compliance_js_1.COMPLIANCE_COUNTRY}.`);
    }
    if (!context.whatsappNumber && (opts.destination ?? "whatsapp") === "whatsapp") {
        notes.push("No WhatsApp number provided — promoted object will omit whatsapp_phone_number.");
    }
    if (!context.imageUrl) {
        notes.push("No image URL provided — creative will not include an image. Add one before activating.");
    }
    return { campaign, adSet, creative, ad, notes };
}
function payloadToParams(payload) {
    const params = {};
    for (const [key, value] of Object.entries(payload)) {
        if (value === undefined || value === null)
            continue;
        params[key] = typeof value === "string" ? value : JSON.stringify(value);
    }
    return params;
}
async function resolveCityTargeting(executor, adAccountId, city) {
    if (!city || !executor)
        return null;
    try {
        const result = await executor.get("search", {
            type: "adgeolocation",
            q: city,
            location_types: JSON.stringify(["city", "region"]),
            limit: "5"
        });
        const rows = Array.isArray(result.data) ? result.data : [];
        const match = rows.find((row) => String(row.name || "").toLowerCase().includes(city.toLowerCase()) &&
            String(row.country_code || "").toUpperCase() === compliance_js_1.COMPLIANCE_COUNTRY);
        if (!match)
            return null;
        return {
            key: String(match.key),
            name: String(match.name),
            countryCode: String(match.country_code || compliance_js_1.COMPLIANCE_COUNTRY)
        };
    }
    catch {
        return null;
    }
}
async function uploadImageByUrl(executor, adAccountId, imageUrl) {
    const result = await executor.post(`${adAccountId}/adimages`, { url: imageUrl });
    const images = result.images;
    if (!images) {
        throw new Error(`Ad image upload returned no images for ${imageUrl}`);
    }
    const hash = Object.values(images)[0]?.hash;
    if (!hash) {
        throw new Error(`Ad image upload returned no hash for ${imageUrl}`);
    }
    return hash;
}
async function createHousingCampaign(executor, config, context, opts = {}) {
    const adAccountId = sanitizeAccount(config, context.adAccountId);
    if (!adAccountId)
        throw new Error("No ad account ID configured. Provide one in the brief or run `social onboard`.");
    const destination = opts.destination || "whatsapp";
    const notes = [];
    const cityTarget = context.city
        ? await resolveCityTargeting(executor, adAccountId, context.city)
        : null;
    if (context.city && !cityTarget) {
        notes.push(`Could not resolve city "${context.city}" to a Meta geo key — using country ${compliance_js_1.COMPLIANCE_COUNTRY} targeting.`);
    }
    const contextWithCity = {
        ...context,
        cityKey: cityTarget?.key,
        city: cityTarget?.name || context.city
    };
    const campaign = buildCampaignPayload(contextWithCity, opts);
    const campaignResult = await executor.post(`${adAccountId}/campaigns`, payloadToParams(campaign));
    const campaignId = String(campaignResult.id || "");
    if (!campaignId)
        throw new Error("Campaign creation returned no id.");
    const adSet = buildAdSetPayload(contextWithCity, opts, campaignId);
    const adSetResult = await executor.post(`${adAccountId}/adsets`, payloadToParams(adSet));
    const adSetId = String(adSetResult.id || "");
    if (!adSetId)
        throw new Error("Ad set creation returned no id.");
    let imageHash = "";
    if (context.imageUrl) {
        try {
            imageHash = await uploadImageByUrl(executor, adAccountId, context.imageUrl);
            notes.push("Image uploaded to the ad account.");
        }
        catch (error) {
            notes.push(`Image upload skipped: ${String(error?.message || error)}`);
        }
    }
    const creative = buildCreativePayload(contextWithCity, opts, imageHash);
    const creativeResult = await executor.post(`${adAccountId}/adcreatives`, payloadToParams(creative));
    const creativeId = String(creativeResult.id || "");
    if (!creativeId)
        throw new Error("Creative creation returned no id.");
    const ad = buildAdPayload(contextWithCity, opts, adSetId, creativeId);
    const adResult = await executor.post(`${adAccountId}/ads`, payloadToParams(ad));
    const adId = String(adResult.id || "");
    if (!adId)
        throw new Error("Ad creation returned no id.");
    const status = opts.status || "PAUSED";
    return {
        campaignId,
        adSetId,
        creativeId,
        adId,
        status,
        destination,
        dailyBudgetInr: opts.dailyBudgetInr || 500,
        ...(imageHash ? { imageHash } : {}),
        ...(contextWithCity.city ? { city: contextWithCity.city } : {}),
        ...(contextWithCity.cityKey ? { cityKey: contextWithCity.cityKey } : {}),
        reviewUrl: `https://www.facebook.com/adsmanager/manage/campaigns?act=${adAccountId.replace("act_", "")}&selected_campaign_ids=${campaignId}`,
        notes
    };
}
exports._private = {
    buildCampaignPayload,
    buildAdSetPayload,
    buildCreativePayload,
    buildAdPayload,
    buildAllPayloads,
    campaignNameFor,
    inrToMinorUnits,
    leadGenObjective,
    normalizeAdAccountId,
    payloadToParams,
    sanitizeAccount
};
