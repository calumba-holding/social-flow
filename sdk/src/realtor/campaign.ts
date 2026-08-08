import type { SocialConfig } from "../types.js";
import type { MetaHttpExecutor } from "../types.js";
import { COMPLIANCE_COUNTRY, encodeTargetingForApi, housingCategoryPayload, sanitizeTargetingForHousing } from "./compliance.js";

export type RealtorDestination = "whatsapp" | "lead_form";

export interface CampaignContext {
  pageId: string;
  adAccountId: string;
  whatsappNumber?: string;
  leadFormId?: string;
  imageUrl?: string;
  city?: string;
  cityKey?: string;
  projectName?: string;
}

export interface BuildOptions {
  destination?: RealtorDestination;
  status?: "PAUSED" | "ACTIVE";
  dailyBudgetInr?: number;
  objective?: string;
  campaignName?: string;
  advantageAudience?: 0 | 1;
  advantagePlusLeads?: boolean;
}

export interface BuiltPayloads {
  campaign: Record<string, unknown>;
  adSet: Record<string, unknown>;
  creative: Record<string, unknown>;
  ad: Record<string, unknown>;
  notes: string[];
}

export function inrToMinorUnits(amountInr: number): number {
  return Math.round(amountInr * 100);
}

export function normalizeAdAccountId(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return raw;
  return raw.startsWith("act_") ? raw : `act_${raw}`;
}

export function normalizePageId(value: string): string {
  return String(value || "").trim();
}

function sanitizeAccount(config: SocialConfig, adAccountId: string): string {
  return normalizeAdAccountId(adAccountId || config.defaultAdAccountId || "");
}

function campaignNameFor(context: CampaignContext, opts: BuildOptions): string {
  if (opts.campaignName) return opts.campaignName;
  const base = context.projectName || context.city || "Real estate";
  return `[REALTOR] ${base} · ${opts.destination || "whatsapp"}`;
}

function leadGenObjective(destination: RealtorDestination | undefined): string {
  return destination === "whatsapp" ? "CONVERSATIONS" : "LEAD_GENERATION";
}

export function buildCampaignPayload(context: CampaignContext, opts: BuildOptions = {}): Record<string, unknown> {
  const category = housingCategoryPayload();
  const payload: Record<string, unknown> = {
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

export function buildAdSetPayload(
  context: CampaignContext,
  opts: BuildOptions = {},
  campaignId = ""
): Record<string, unknown> {
  const dailyBudgetInr = opts.dailyBudgetInr || 500;
  const destination = opts.destination || "whatsapp";

  const targetingBase: Record<string, unknown> = {
    geo_locations: {
      countries: [COMPLIANCE_COUNTRY]
    }
  };
  if (context.cityKey && context.city) {
    (targetingBase.geo_locations as Record<string, unknown>).cities = [
      { key: context.cityKey, name: context.city, country_code: COMPLIANCE_COUNTRY, radius: 50, distance_unit: "km" }
    ];
  }

  const compliance = sanitizeTargetingForHousing(targetingBase);

  const promotedObject: Record<string, unknown> = { page_id: normalizePageId(context.pageId) };
  if (destination === "whatsapp" && context.whatsappNumber) {
    promotedObject.whatsapp_phone_number = context.whatsappNumber;
  }

  const payload: Record<string, unknown> = {
    name: `[REALTOR] Ad set · ${context.city || "India"} · ${destination}`,
    campaign_id: campaignId,
    billing_event: "IMPRESSIONS",
    optimization_goal: leadGenObjective(destination),
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    daily_budget: String(inrToMinorUnits(dailyBudgetInr)),
    targeting: encodeTargetingForApi(compliance.clean),
    targeting_automation: { advantage_audience: opts.advantageAudience ?? 0 },
    promoted_object: encodeTargetingForApi(promotedObject),
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
  } else {
    payload.destination_type = "ON_AD";
  }
  return payload;
}

export function buildCreativePayload(context: CampaignContext, opts: BuildOptions = {}, imageHash = ""): Record<string, unknown> {
  const destination = opts.destination || "whatsapp";
  const message =
    context.projectName
      ? `Explore ${context.projectName}${context.city ? ` in ${context.city}` : ""}. Connect on WhatsApp for details.`
      : `Explore premium real estate${context.city ? ` in ${context.city}` : ""}. Connect on WhatsApp for details.`;

  const linkData: Record<string, unknown> = {
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
    object_story_spec: encodeTargetingForApi({
      page_id: normalizePageId(context.pageId),
      link_data: linkData
    })
  };
}

export function buildAdPayload(context: CampaignContext, opts: BuildOptions = {}, adSetId = "", creativeId = ""): Record<string, unknown> {
  return {
    name: `[REALTOR] Ad · ${context.city || "India"} · ${opts.destination || "whatsapp"}`,
    adset_id: adSetId,
    creative: encodeTargetingForApi({ creative_id: creativeId }),
    status: opts.status || "PAUSED"
  };
}

export function buildAllPayloads(context: CampaignContext, opts: BuildOptions = {}): BuiltPayloads {
  const campaign = buildCampaignPayload(context, opts);
  const adSet = buildAdSetPayload(context, opts);
  const creative = buildCreativePayload(context, opts);
  const ad = buildAdPayload(context, opts);

  const notes: string[] = [];
  notes.push(`Daily budget: ${opts.dailyBudgetInr || 500} INR (${inrToMinorUnits(opts.dailyBudgetInr || 500)} minor units).`);
  notes.push(`Destination: ${opts.destination || "whatsapp"}.`);
  if (context.city && !context.cityKey) {
    notes.push(`City "${context.city}" was not resolved to a Meta geo key — targeting falls back to country ${COMPLIANCE_COUNTRY}.`);
  }
  if (!context.whatsappNumber && (opts.destination ?? "whatsapp") === "whatsapp") {
    notes.push("No WhatsApp number provided — promoted object will omit whatsapp_phone_number.");
  }
  if (!context.imageUrl) {
    notes.push("No image URL provided — creative will not include an image. Add one before activating.");
  }

  return { campaign, adSet, creative, ad, notes };
}

export interface ResolvedCity {
  key: string;
  name: string;
  countryCode: string;
}

export function payloadToParams(payload: Record<string, unknown>): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null) continue;
    params[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  return params;
}

export async function resolveCityTargeting(executor: MetaHttpExecutor, adAccountId: string, city: string): Promise<ResolvedCity | null> {
  if (!city || !executor) return null;
  try {
    const result = await executor.get("search", {
      type: "adgeolocation",
      q: city,
      location_types: JSON.stringify(["city", "region"]),
      limit: "5"
    });
    const rows = Array.isArray(result.data) ? result.data : [];
    const match = rows.find(
      (row: Record<string, unknown>) =>
        String(row.name || "").toLowerCase().includes(city.toLowerCase()) &&
        String(row.country_code || "").toUpperCase() === COMPLIANCE_COUNTRY
    );
    if (!match) return null;
    return {
      key: String(match.key),
      name: String(match.name),
      countryCode: String(match.country_code || COMPLIANCE_COUNTRY)
    };
  } catch {
    return null;
  }
}

export async function uploadImageByUrl(executor: MetaHttpExecutor, adAccountId: string, imageUrl: string): Promise<string> {
  const result = await executor.post(`${adAccountId}/adimages`, { url: imageUrl });
  const images = result.images as Record<string, { hash?: string; status?: string }> | undefined;
  if (!images) {
    throw new Error(`Ad image upload returned no images for ${imageUrl}`);
  }
  const hash = Object.values(images)[0]?.hash;
  if (!hash) {
    throw new Error(`Ad image upload returned no hash for ${imageUrl}`);
  }
  return hash;
}

export interface HousingCampaignResult {
  campaignId: string;
  adSetId: string;
  creativeId: string;
  adId: string;
  status: string;
  destination: RealtorDestination;
  dailyBudgetInr: number;
  imageHash?: string;
  city?: string;
  cityKey?: string;
  reviewUrl: string;
  notes: string[];
}

export async function createHousingCampaign(
  executor: MetaHttpExecutor,
  config: SocialConfig,
  context: CampaignContext,
  opts: BuildOptions = {}
): Promise<HousingCampaignResult> {
  const adAccountId = sanitizeAccount(config, context.adAccountId);
  if (!adAccountId) throw new Error("No ad account ID configured. Provide one in the brief or run `social onboard`.");
  const destination = opts.destination || "whatsapp";

  const notes: string[] = [];

  const cityTarget = context.city
    ? await resolveCityTargeting(executor, adAccountId, context.city)
    : null;
  if (context.city && !cityTarget) {
    notes.push(`Could not resolve city "${context.city}" to a Meta geo key — using country ${COMPLIANCE_COUNTRY} targeting.`);
  }
  const contextWithCity: CampaignContext = {
    ...context,
    cityKey: cityTarget?.key,
    city: cityTarget?.name || context.city
  };

  const campaign = buildCampaignPayload(contextWithCity, opts);
  const campaignResult = await executor.post(`${adAccountId}/campaigns`, payloadToParams(campaign));
  const campaignId = String(campaignResult.id || "");
  if (!campaignId) throw new Error("Campaign creation returned no id.");

  const adSet = buildAdSetPayload(contextWithCity, opts, campaignId);
  const adSetResult = await executor.post(`${adAccountId}/adsets`, payloadToParams(adSet));
  const adSetId = String(adSetResult.id || "");
  if (!adSetId) throw new Error("Ad set creation returned no id.");

  let imageHash = "";
  if (context.imageUrl) {
    try {
      imageHash = await uploadImageByUrl(executor, adAccountId, context.imageUrl);
      notes.push("Image uploaded to the ad account.");
    } catch (error) {
      notes.push(`Image upload skipped: ${String((error as Error)?.message || error)}`);
    }
  }

  const creative = buildCreativePayload(contextWithCity, opts, imageHash);
  const creativeResult = await executor.post(`${adAccountId}/adcreatives`, payloadToParams(creative));
  const creativeId = String(creativeResult.id || "");
  if (!creativeId) throw new Error("Creative creation returned no id.");

  const ad = buildAdPayload(contextWithCity, opts, adSetId, creativeId);
  const adResult = await executor.post(`${adAccountId}/ads`, payloadToParams(ad));
  const adId = String(adResult.id || "");
  if (!adId) throw new Error("Ad creation returned no id.");

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

export const _private = {
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
