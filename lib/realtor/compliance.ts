export const HOUSING_CATEGORY = "HOUSING";
export const COMPLIANCE_COUNTRY = "IN";
export const SPECIAL_AD_CATEGORY = ["HOUSING"] as const;
export const SPECIAL_AD_CATEGORY_COUNTRY = [COMPLIANCE_COUNTRY] as const;

export interface TargetingComplianceResult {
  clean: Record<string, unknown>;
  removed: string[];
  warnings: string[];
}

export const RESTRICTED_TARGETING_KEYS = [
  "age_min",
  "age_max",
  "age",
  "genders",
  "income",
  "zip",
  "zips",
  "work_employers",
  "work_positions",
  "work_employers_text",
  "education_schools",
  "education_statuses",
  "education_majors",
  "education_degrees",
  "behaviors",
  "behaviors_text",
  "life_events",
  "relationship_statuses",
  "interests",
  "interest"
] as const;

export interface HousingScopeRequirement {
  scope: string;
  why: string;
}

export const HOUSING_SCOPES: HousingScopeRequirement[] = [
  { scope: "ads_management", why: "Create and manage ad campaigns, ad sets and ads" },
  { scope: "ads_read", why: "Read campaign performance and insights" },
  { scope: "pages_read_engagement", why: "Attach the Facebook Page to the ad" },
  { scope: "business_management", why: "Access the ad account tied to your business" },
  { scope: "pages_show_list", why: "List pages available to attach to the ad" }
];

export function sanitizeTargetingForHousing(input: Record<string, unknown> | undefined): TargetingComplianceResult {
  const clean: Record<string, unknown> = {};
  const removed: string[] = [];
  const warnings: string[] = [];

  const source = input && typeof input === "object" ? input : {};

  for (const [key, value] of Object.entries(source)) {
    const blocked = (RESTRICTED_TARGETING_KEYS as readonly string[]).includes(key);
    if (blocked) {
      removed.push(key);
      warnings.push(`Removed restricted targeting key "${key}" (not allowed for housing ads).`);
      continue;
    }
    clean[key] = value;
  }

  if (clean.geo_locations && typeof clean.geo_locations === "object") {
    const geo = clean.geo_locations as Record<string, unknown>;
    if (geo.zip && Array.isArray(geo.zip) && geo.zip.length > 0) {
      removed.push("geo_locations.zip");
      warnings.push("Removed ZIP/location-radius targeting (restricted for housing ads).");
      delete geo.zip;
    }
    if (geo.location_types && Array.isArray(geo.location_types) && geo.location_types.includes("zip")) {
      geo.location_types = geo.location_types.filter((t: string) => t !== "zip");
      warnings.push("Removed zip from geo location types.");
    }
  }

  if (!clean.geo_locations) {
    clean.geo_locations = { countries: [COMPLIANCE_COUNTRY] };
    warnings.push(`No location targeting found; defaulting to country "${COMPLIANCE_COUNTRY}".`);
  } else {
    const geo = clean.geo_locations as Record<string, unknown>;
    if (!geo.countries) {
      geo.countries = [COMPLIANCE_COUNTRY];
    } else if (Array.isArray(geo.countries) && !geo.countries.includes(COMPLIANCE_COUNTRY)) {
      (geo.countries as string[]).push(COMPLIANCE_COUNTRY);
      warnings.push(`Added "${COMPLIANCE_COUNTRY}" to country targeting (required for this ad account).`);
    }
  }

  return { clean, removed, warnings };
}

export function housingCategoryPayload(): { special_ad_categories: string[]; special_ad_category_country: string[] } {
  return {
    special_ad_categories: [...SPECIAL_AD_CATEGORY],
    special_ad_category_country: [...SPECIAL_AD_CATEGORY_COUNTRY]
  };
}

export function complianceNotice(): string[] {
  return [
    `Category: ${HOUSING_CATEGORY} (special ad category for real estate)`,
    `Country: ${COMPLIANCE_COUNTRY} — special ad category regulations apply`,
    "Targeting restriction: no age, gender, income, ZIP, employer or education targeting",
    "Location radius targeting is removed where it could act as ZIP targeting",
    "Campaigns are created PAUSED and must be reviewed in Ads Manager before activation"
  ];
}

export function housingScopesNotice(): string[] {
  return HOUSING_SCOPES.map((req) => `${req.scope} — ${req.why}`);
}

export function requiredScopesList(): string[] {
  return HOUSING_SCOPES.map((req) => req.scope);
}

export function validateTargetingForHousing(targeting: Record<string, unknown> | undefined): TargetingComplianceResult {
  return sanitizeTargetingForHousing(targeting);
}

export function encodeTargetingForApi(targeting: Record<string, unknown>): string {
  return JSON.stringify(targeting);
}

export const _private = {
  RESTRICTED_TARGETING_KEYS,
  sanitizeTargetingForHousing,
  housingCategoryPayload,
  complianceNotice,
  housingScopesNotice,
  requiredScopesList,
  validateTargetingForHousing,
  encodeTargetingForApi
};
