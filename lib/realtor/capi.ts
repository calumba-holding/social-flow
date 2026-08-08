import { createHash } from "node:crypto";
import type { SocialConfig } from "../../core/types.js";
import type { MetaHttpExecutor } from "../../executors/http.js";

export type CapiEventName = "Lead" | "LeadSubmitted" | "CompleteRegistration" | "Contact";

export interface CapiUserData {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  clientIpAddress?: string;
  clientUserAgent?: string;
}

export interface CapiEvent {
  eventName: CapiEventName;
  eventId?: string;
  eventTime?: number;
  eventSourceUrl?: string;
  actionSource?: "website" | "lead" | "phone_call" | "conversation";
  userData?: CapiUserData;
  customData?: Record<string, unknown>;
}

export interface CapiSendResult {
  eventId: string;
  received: boolean;
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashUserDatum(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return undefined;
  return sha256Hex(normalized);
}

export function buildUserData(userData: CapiUserData = {}): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const email = hashUserDatum(userData.email);
  const phone = hashUserDatum(userData.phone);
  const firstName = hashUserDatum(userData.firstName);
  const lastName = hashUserDatum(userData.lastName);
  if (email) out.em = [email];
  if (phone) out.ph = [phone];
  if (firstName) out.fn = [firstName];
  if (lastName) out.ln = [lastName];
  if (userData.clientIpAddress) out.client_ip_address = [userData.clientIpAddress];
  if (userData.clientUserAgent) out.client_user_agent = [userData.clientUserAgent];
  return out;
}

export function buildLeadEvent(event: CapiEvent): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    event_name: event.eventName,
    event_time: event.eventTime || Math.floor(Date.now() / 1000),
    action_source: event.actionSource || "website"
  };
  if (event.eventId) payload.event_id = event.eventId;
  if (event.eventSourceUrl) payload.event_source_url = event.eventSourceUrl;
  const userData = buildUserData(event.userData);
  payload.user_data = userData;
  if (event.customData && Object.keys(event.customData).length) {
    payload.custom_data = event.customData;
  }
  return payload;
}

export async function sendEvent(
  executor: MetaHttpExecutor,
  config: SocialConfig,
  adAccountId: string,
  event: CapiEvent
): Promise<CapiSendResult> {
  const normalized = String(adAccountId || config.defaultAdAccountId || "").trim();
  if (!normalized) throw new Error("No ad account ID configured for Conversions API.");
  const eventPayload = buildLeadEvent(event);
  const result = await executor.post(`${normalized}/events`, {
    data: JSON.stringify([eventPayload])
  });
  const entries = Array.isArray(result.data) ? result.data : [];
  const entry = entries[0] as Record<string, unknown> | undefined;
  return {
    eventId: String(event.eventId || eventPayload.event_name || ""),
    received: entry?.event_received === true || Boolean(entry?.event_received)
  };
}

export const _private = {
  sha256Hex,
  hashUserDatum,
  buildUserData,
  buildLeadEvent,
  sendEvent
};
