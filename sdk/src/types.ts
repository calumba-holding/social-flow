export interface SocialConfig {
  token: string;
  graphVersion: string;
  scopes: string[];
  defaultApi?: string;
  activeProfile?: string;
  configPath?: string;
  apiTokens?: Record<string, string>;
  defaultPageId?: string;
  defaultAdAccountId?: string;
  defaultWhatsAppNumberId?: string;
}

export interface MetaHttpExecutor {
  get(path: string, params: Record<string, string>): Promise<Record<string, unknown>>;
  post(path: string, params: Record<string, string>): Promise<Record<string, unknown>>;
}

export type SdkRisk = "LOW" | "MEDIUM" | "HIGH";

export type SdkAction =
  | "status"
  | "doctor"
  | "get_profile"
  | "create_post"
  | "list_ads"
  | "send_whatsapp"
  | "logs"
  | "replay"
  | "realtor_scopes"
  | "realtor_build"
  | "realtor_preview"
  | "realtor_report"
  | "realtor_leads"
  | "realtor_leadform"
  | "realtor_capi"
  | "realtor_create_campaign";

export interface SdkError {
  code: string;
  message: string;
  retryable: boolean;
  suggestedNextCommand: string;
  details?: unknown;
}

export interface SdkMeta {
  action: string;
  risk: string;
  requiresApproval: boolean;
  approvalToken: string | null;
  approvalTokenExpiresAt: string | null;
  source: string;
}

export interface SdkEnvelope<TData = unknown> {
  ok: boolean;
  traceId: string;
  data: TData | null;
  error: SdkError | null;
  meta: SdkMeta;
}

export interface SdkPlanData {
  planned: boolean;
  action: SdkAction;
  params: Record<string, unknown>;
  risk: SdkRisk;
  requiresApproval: boolean;
  approvalToken: string | null;
  approvalTokenExpiresAt: string | null;
}

export interface SdkActionOptions {
  approvalToken?: string;
  approvalReason?: string;
}

export interface SocialFlowClientOptions {
  baseUrl: string;
  gatewayKey?: string;
  sessionId?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export type RealtorDestination = "whatsapp" | "lead_form";

export interface RealtorBriefInput {
  text?: string;
  propertyType?: string;
  bhk?: string;
  city?: string;
  locality?: string;
  price?: string;
  possession?: string;
  dailyBudget?: number;
  projectName?: string;
  pageId?: string;
  adAccountId?: string;
  whatsappNumber?: string;
  leadFormId?: string;
  image?: string;
}

export interface RealtorBuildInput extends RealtorBriefInput {
  text?: string;
}

export interface RealtorPreviewInput extends RealtorBriefInput {
  dailyBudgetInr?: number;
  destination?: RealtorDestination;
  status?: "PAUSED" | "ACTIVE";
  advantageAudience?: 0 | 1;
  advantagePlusLeads?: boolean;
}

export interface RealtorCreateInput extends RealtorPreviewInput {
  text: string;
}

export interface RealtorReportInput {
  adAccountId?: string;
  campaignId?: string;
  preset?: string;
  level?: string;
  limit?: number;
}

export interface RealtorLeadsInput {
  adAccountId?: string;
  adId?: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
}

export interface RealtorLeadFormQuestion {
  type: string;
  key?: string;
  label?: string;
  options?: string[];
}

export interface RealtorLeadFormInput extends RealtorBriefInput {
  name?: string;
  privacyPolicyUrl: string;
  contextType?: string;
  followUpActionUrl?: string;
  questions?: RealtorLeadFormQuestion[];
  optimizedForQuality?: boolean;
}

export interface RealtorCapiInput {
  adAccountId?: string;
  eventName?: string;
  eventId?: string;
  eventTime?: number;
  eventSourceUrl?: string;
  actionSource?: string;
  userData?: {
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    clientIpAddress?: string;
    clientUserAgent?: string;
  };
  customData?: Record<string, unknown>;
}
