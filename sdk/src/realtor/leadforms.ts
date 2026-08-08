import type { SocialConfig } from "../types.js";
import type { MetaHttpExecutor } from "../types.js";

export const LEAD_FORM_QUESTION_TYPES = [
  "CUSTOM",
  "FULL_NAME",
  "PHONE",
  "EMAIL",
  "WHATSAPP_ACCOUNT",
  "POSTAL_CODE",
  "STREET_ADDRESS",
  "DATE_TIME"
] as const;

export interface LeadFormQuestion {
  type: string;
  key?: string;
  label?: string;
  options?: string[];
}

export interface LeadFormOptions {
  privacyPolicyUrl: string;
  contextType?: string;
  followUpActionUrl?: string;
  questions?: LeadFormQuestion[];
  optimizedForQuality?: boolean;
  locale?: string;
}

export interface LeadFormResult {
  formId: string;
  pageId: string;
  name: string;
  reviewUrl: string;
}

export function buildLeadFormPayload(name: string, opts: LeadFormOptions): Record<string, unknown> {
  const payload: Record<string, unknown> = {
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

export function defaultQuestions(): LeadFormQuestion[] {
  return [
    { type: "FULL_NAME" },
    { type: "PHONE" },
    { type: "EMAIL" }
  ];
}

export async function createLeadForm(
  executor: MetaHttpExecutor,
  config: SocialConfig,
  pageId: string,
  name: string,
  opts: LeadFormOptions
): Promise<LeadFormResult> {
  const normalizedPageId = String(pageId || config.defaultPageId || "").trim();
  if (!normalizedPageId) {
    throw new Error("No Page ID configured. Provide one or run `social onboard`.");
  }
  const payload = buildLeadFormPayload(name, opts);
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null) continue;
    params[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  const result = await executor.post(`${normalizedPageId}/leadgen_forms`, params);
  const formId = String(result.id || "");
  if (!formId) throw new Error("Lead form creation returned no id.");
  return {
    formId,
    pageId: normalizedPageId,
    name,
    reviewUrl: `https://www.facebook.com/business/lead-gen-tool/pages/${normalizedPageId}`
  };
}

export interface LeadFetchOptions {
  adAccountId?: string;
  adId?: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
}

export interface LeadRow {
  id: string;
  createdTime?: string;
  adId?: string;
  formId?: string;
  fields: Record<string, string>;
  fieldLabels?: string[];
}

export async function fetchLeads(
  executor: MetaHttpExecutor,
  config: SocialConfig,
  opts: LeadFetchOptions = {}
): Promise<LeadRow[]> {
  const path = opts.adId || String(opts.adAccountId || config.defaultAdAccountId || "").trim();
  if (!path) throw new Error("No ad ID or ad account ID provided to fetch leads.");

  const params: Record<string, string> = { limit: String(opts.limit || 25) };
  if (opts.startTime) params.start_time = String(opts.startTime);
  if (opts.endTime) params.end_time = String(opts.endTime);

  const result = await executor.get(`${path}/leads`, params);
  const rows = Array.isArray(result.data) ? result.data : [];
  return rows.map((row: Record<string, unknown>) => {
    const rawFields = Array.isArray(row.field_data) ? row.field_data : [];
    const fields: Record<string, string> = {};
    for (const entry of rawFields) {
      const entryObj = entry as Record<string, unknown>;
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
      fieldLabels: rawFields.map((entry) => String((entry as Record<string, unknown>).name || ""))
    };
  });
}

export const _private = {
  buildLeadFormPayload,
  defaultQuestions,
  createLeadForm,
  fetchLeads
};
