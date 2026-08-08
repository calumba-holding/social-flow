"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports._private = exports.HOUSING_SCOPES = exports.RESTRICTED_TARGETING_KEYS = exports.SPECIAL_AD_CATEGORY_COUNTRY = exports.SPECIAL_AD_CATEGORY = exports.COMPLIANCE_COUNTRY = exports.HOUSING_CATEGORY = void 0;
exports.sanitizeTargetingForHousing = sanitizeTargetingForHousing;
exports.housingCategoryPayload = housingCategoryPayload;
exports.complianceNotice = complianceNotice;
exports.housingScopesNotice = housingScopesNotice;
exports.requiredScopesList = requiredScopesList;
exports.validateTargetingForHousing = validateTargetingForHousing;
exports.encodeTargetingForApi = encodeTargetingForApi;
exports.HOUSING_CATEGORY = "HOUSING";
exports.COMPLIANCE_COUNTRY = "IN";
exports.SPECIAL_AD_CATEGORY = ["HOUSING"];
exports.SPECIAL_AD_CATEGORY_COUNTRY = [exports.COMPLIANCE_COUNTRY];
exports.RESTRICTED_TARGETING_KEYS = [
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
];
exports.HOUSING_SCOPES = [
    { scope: "ads_management", why: "Create and manage ad campaigns, ad sets and ads" },
    { scope: "ads_read", why: "Read campaign performance and insights" },
    { scope: "pages_read_engagement", why: "Attach the Facebook Page to the ad" },
    { scope: "business_management", why: "Access the ad account tied to your business" },
    { scope: "pages_show_list", why: "List pages available to attach to the ad" }
];
function sanitizeTargetingForHousing(input) {
    const clean = {};
    const removed = [];
    const warnings = [];
    const source = input && typeof input === "object" ? input : {};
    for (const [key, value] of Object.entries(source)) {
        const blocked = exports.RESTRICTED_TARGETING_KEYS.includes(key);
        if (blocked) {
            removed.push(key);
            warnings.push(`Removed restricted targeting key "${key}" (not allowed for housing ads).`);
            continue;
        }
        clean[key] = value;
    }
    if (clean.geo_locations && typeof clean.geo_locations === "object") {
        const geo = clean.geo_locations;
        if (geo.zip && Array.isArray(geo.zip) && geo.zip.length > 0) {
            removed.push("geo_locations.zip");
            warnings.push("Removed ZIP/location-radius targeting (restricted for housing ads).");
            delete geo.zip;
        }
        if (geo.location_types && Array.isArray(geo.location_types) && geo.location_types.includes("zip")) {
            geo.location_types = geo.location_types.filter((t) => t !== "zip");
            warnings.push("Removed zip from geo location types.");
        }
    }
    if (!clean.geo_locations) {
        clean.geo_locations = { countries: [exports.COMPLIANCE_COUNTRY] };
        warnings.push(`No location targeting found; defaulting to country "${exports.COMPLIANCE_COUNTRY}".`);
    }
    else {
        const geo = clean.geo_locations;
        if (!geo.countries) {
            geo.countries = [exports.COMPLIANCE_COUNTRY];
        }
        else if (Array.isArray(geo.countries) && !geo.countries.includes(exports.COMPLIANCE_COUNTRY)) {
            geo.countries.push(exports.COMPLIANCE_COUNTRY);
            warnings.push(`Added "${exports.COMPLIANCE_COUNTRY}" to country targeting (required for this ad account).`);
        }
    }
    return { clean, removed, warnings };
}
function housingCategoryPayload() {
    return {
        special_ad_categories: [...exports.SPECIAL_AD_CATEGORY],
        special_ad_category_country: [...exports.SPECIAL_AD_CATEGORY_COUNTRY]
    };
}
function complianceNotice() {
    return [
        `Category: ${exports.HOUSING_CATEGORY} (special ad category for real estate)`,
        `Country: ${exports.COMPLIANCE_COUNTRY} — special ad category regulations apply`,
        "Targeting restriction: no age, gender, income, ZIP, employer or education targeting",
        "Location radius targeting is removed where it could act as ZIP targeting",
        "Campaigns are created PAUSED and must be reviewed in Ads Manager before activation"
    ];
}
function housingScopesNotice() {
    return exports.HOUSING_SCOPES.map((req) => `${req.scope} — ${req.why}`);
}
function requiredScopesList() {
    return exports.HOUSING_SCOPES.map((req) => req.scope);
}
function validateTargetingForHousing(targeting) {
    return sanitizeTargetingForHousing(targeting);
}
function encodeTargetingForApi(targeting) {
    return JSON.stringify(targeting);
}
exports._private = {
    RESTRICTED_TARGETING_KEYS: exports.RESTRICTED_TARGETING_KEYS,
    sanitizeTargetingForHousing,
    housingCategoryPayload,
    complianceNotice,
    housingScopesNotice,
    requiredScopesList,
    validateTargetingForHousing,
    encodeTargetingForApi
};
