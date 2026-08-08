export type PropertyType =
  | "apartment"
  | "villa"
  | "plot"
  | "floor"
  | "commercial"
  | "independent_house";

export interface RealtorBrief {
  projectName?: string;
  builderName?: string;
  propertyType?: PropertyType | string;
  bhk?: string;
  city?: string;
  locality?: string;
  price?: string;
  possession?: string;
  possessionDate?: string;
  dailyBudget?: number;
  pageId?: string;
  adAccountId?: string;
  whatsappNumber?: string;
  image?: string;
  message?: string;
  leadFormId?: string;
  destination?: "whatsapp" | "lead_form";
}

export type BriefField = keyof RealtorBrief;

const INDIA_CITIES = [
  "mumbai",
  "delhi",
  "ncr",
  "gurgaon",
  "gurugram",
  "noida",
  "bengaluru",
  "bangalore",
  "hyderabad",
  "pune",
  "chennai",
  "kolkata",
  "ahmedabad",
  "jaipur",
  "chandigarh",
  "lucknow",
  "indore",
  "nagpur",
  "surat",
  "kochi",
  "coimbatore",
  "thane",
  "navi mumbai",
  "faridabad",
  "ghaziabad",
  "visakhapatnam",
  "bhopal",
  "patna",
  "ludhiana",
  "agra",
  "nashik",
  "vadodara",
  "varanasi",
  "meerut",
  "rajkot",
  "jodhpur",
  "dehradun",
  "amritsar",
  "guwahati",
  "mysuru",
  "thiruvananthapuram",
  "bhubaneswar",
  "ranchi",
  "raipur",
  "goa",
  "panaji",
  "kanpur",
  "aurangabad",
  "gwalior",
  "jammu",
  "haridwar",
  "udaipur",
  "alwar",
  "agra",
  "bikaner",
  "ajmer"
] as const;

const CITY_PATTERN = new RegExp(
  `\\b(${INDIA_CITIES.map((c) => c.replace(/\s+/g, "\\s+")).join("|")})\\b`,
  "i"
);

export function normalizeText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

export function inrAmountFromText(text: string): number | null {
  const raw = normalizeText(text);
  if (!raw) return null;

  const suffixMap: Record<string, number> = {
    crore: 10_000_000,
    crores: 10_000_000,
    cr: 10_000_000,
    lakh: 100_000,
    lakhs: 100_000,
    lac: 100_000,
    lacs: 100_000,
    thousand: 1_000,
    k: 1_000
  };

  const patterns = [
    /(?:₹|rs\.?|inr|rupees?)\s*(\d+(?:[.,]\d+)?)\s*(thousand|lakh|lakhs|lac|lacs|crore|crores|cr|k)?/i,
    /(\d+(?:[.,]\d+)?)\s*(lakh|lakhs|lac|lacs|crore|crores|cr)\b/i,
    /(\d+(?:[.,]\d+)?)\s*[k]\b/i
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (!match) continue;
    const amountText = String(match[1] || "").replace(/,/g, "");
    const amount = Number(amountText);
    if (!Number.isFinite(amount)) continue;
    const suffix = String(match[2] || "").toLowerCase();
    const multiplier = suffixMap[suffix] || 1;
    const value = amount * multiplier;
    if (value > 0) return Math.round(value);
  }

  const bare = raw.match(/\b(\d{3,7})\b/);
  if (bare) {
    const amount = Number(bare[1]);
    if (Number.isFinite(amount) && amount > 0) return amount;
  }

  return null;
}

export function parseBhk(text: string): string {
  const raw = normalizeText(text);
  const match = raw.match(/\b(\d+(?:\.\d+)?)\s*bhk\b/i);
  return match ? `${match[1]} BHK` : "";
}

export function parseCity(text: string): string {
  const raw = normalizeText(text).toLowerCase();
  const match = raw.match(CITY_PATTERN);
  if (!match) return "";
  const city = match[1].toLowerCase();
  const display = city === "bangalore" ? "Bengaluru" : city === "gurgaon" ? "Gurugram" : city.charAt(0).toUpperCase() + city.slice(1);
  return display;
}

export function parseLocality(text: string): string {
  const raw = normalizeText(text);
  const city = parseCity(raw);
  const cleaned = String(raw || "").replace(/[.,!?]+$/g, "").trim();

  const patterns = [
    /\b(?:in|around|near)\s+([A-Za-z][A-Za-z0-9 .'/-]{2,60}?)(?:,|\s+(?:area|locality)\b|\s+for\b|\s*$)/i,
    /\b([A-Za-z][A-Za-z0-9 .'/-]{2,60}?)\s+(?:area|locality)\b/i
  ];
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (!match) continue;
    const candidate = String(match[1] || "").trim().replace(/[.,!?]+$/g, "").trim();
    if (!candidate) continue;
    if (candidate.length < 2) continue;
    if (city && candidate.toLowerCase() === city.toLowerCase()) continue;
    if ((INDIA_CITIES as readonly string[]).includes(candidate.toLowerCase())) continue;
    const words = candidate.split(/\s+/);
    if (words.some((word) => (INDIA_CITIES as readonly string[]).includes(word.toLowerCase()))) continue;
    return candidate.charAt(0).toUpperCase() + candidate.slice(1);
  }
  return "";
}

export function parsePossession(text: string): Pick<RealtorBrief, "possession" | "possessionDate"> {
  const raw = normalizeText(text).toLowerCase();
  const out: Pick<RealtorBrief, "possession" | "possessionDate"> = {};
  if (/\bready to move|ready possession|ready to move in|possession now\b/.test(raw)) {
    out.possession = "ready";
  } else if (/\bunder construction|under-construction\b/.test(raw)) {
    out.possession = "under_construction";
  } else if (/\bpossession\b/.test(raw) || /\bpossession\b/.test(raw)) {
    out.possession = "upcoming";
  }

  const dateMatch = raw.match(
    /\bpossession\s+(?:in|by)\s+([a-z]{3,9}\s+\d{4}|\d{4}|[a-z]{3,9})\b|(?:possession|by)\s+([a-z]{3,9}\s+\d{4})\b/i
  );
  const captured = String(dateMatch?.[1] || dateMatch?.[2] || "").trim();
  if (captured) {
    out.possessionDate = captured
      .replace(/\bjan\b/i, "Jan").replace(/\bfeb\b/i, "Feb").replace(/\bmar\b/i, "Mar")
      .replace(/\bapr\b/i, "Apr").replace(/\bjun\b/i, "Jun").replace(/\bjul\b/i, "Jul")
      .replace(/\baug\b/i, "Aug").replace(/\bsep\b/i, "Sep").replace(/\boct\b/i, "Oct")
      .replace(/\bnov\b/i, "Nov").replace(/\bdec\b/i, "Dec");
  }
  return out;
}

export function parseWhatsAppNumber(text: string): string {
  const raw = normalizeText(text);
  const match = raw.match(/\+?[0-9]{10,15}/);
  if (!match) return "";
  let digits = match[0].replace(/[^0-9]/g, "");
  if (digits.length === 10) digits = `91${digits}`;
  if (!digits.startsWith("91")) digits = `91${digits}`;
  return `+${digits}`;
}

export function isKnownCity(value: string): boolean {
  return (INDIA_CITIES as readonly string[]).includes(String(value || "").trim().toLowerCase());
}

export function parseBriefText(text: string): RealtorBrief {
  const raw = normalizeText(text);
  if (!raw) return {};

  const brief: RealtorBrief = {};

  const propertyTypeMatch = raw.match(/\b(apartment|flat|villa|plot|penthouse|independent house|row house|floor|commercial)\b/i);
  if (propertyTypeMatch) {
    const value = propertyTypeMatch[1].toLowerCase();
    if (value === "flat") brief.propertyType = "apartment";
    else if (value === "penthouse") brief.propertyType = "apartment";
    else if (value === "row house") brief.propertyType = "independent_house";
    else brief.propertyType = value;
  }

  const bhk = parseBhk(raw);
  if (bhk) brief.bhk = bhk;

  const city = parseCity(raw);
  if (city) brief.city = city;

  const locality = parseLocality(raw);
  if (locality) brief.locality = locality;

  const price = inrAmountFromText(raw);
  if (price !== null && (price >= 100_000 || /(price|worth|value|selling|asking)/i.test(raw))) {
    brief.price = `₹${price.toLocaleString("en-IN")}`;
  }

  const possession = parsePossession(raw);
  if (possession.possession) brief.possession = possession.possession;
  if (possession.possessionDate) brief.possessionDate = possession.possessionDate;

  const daily = inrAmountFromText(raw);
  if (daily !== null && /\b(budget|daily|per day|spend|ad budget)\b/i.test(raw)) {
    brief.dailyBudget = daily;
  }

  const whatsapp = parseWhatsAppNumber(raw);
  if (whatsapp) brief.whatsappNumber = whatsapp;

  if (raw.length > 40) brief.message = raw;

  return brief;
}

export function formatInr(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(value);
}

export function requiredFields(brief: RealtorBrief, includeIds = true): BriefField[] {
  const missing: BriefField[] = [];
  if (!brief.city && !brief.locality) missing.push("city");
  if (!brief.dailyBudget) missing.push("dailyBudget");
  if (!brief.whatsappNumber) missing.push("whatsappNumber");
  if (!brief.message) missing.push("message");
  if (includeIds) {
    if (!brief.pageId) missing.push("pageId");
    if (!brief.adAccountId) missing.push("adAccountId");
  }
  return missing;
}

export function briefComplete(brief: RealtorBrief, includeIds = true): boolean {
  return requiredFields(brief, includeIds).length === 0;
}

export function formatBrief(brief: RealtorBrief): string {
  const lines: string[] = [];
  if (brief.projectName) lines.push(`Project: ${brief.projectName}`);
  if (brief.builderName) lines.push(`Builder/agency: ${brief.builderName}`);
  const unit = [
    brief.bhk,
    brief.propertyType ? String(brief.propertyType).replace(/_/g, " ") : ""
  ].filter(Boolean).join(" ") || "property";
  lines.push(`Property: ${unit}`);
  const location = [brief.locality, brief.city].filter(Boolean).join(", ");
  if (location) lines.push(`Location: ${location}`);
  if (brief.price) lines.push(`Price: ${brief.price}`);
  if (brief.possession === "ready") lines.push("Possession: Ready to move in");
  else if (brief.possession === "under_construction") {
    lines.push(brief.possessionDate ? `Possession: Under construction (by ${brief.possessionDate})` : "Possession: Under construction");
  } else if (brief.possessionDate) lines.push(`Possession: ${brief.possessionDate}`);
  if (brief.dailyBudget) lines.push(`Daily ad budget: ${formatInr(brief.dailyBudget)}`);
  if (brief.whatsappNumber) lines.push(`WhatsApp: ${brief.whatsappNumber}`);
  if (brief.message) lines.push(`Ad message: ${brief.message}`);
  if (brief.pageId) lines.push(`Facebook page ID: ${brief.pageId}`);
  if (brief.adAccountId) lines.push(`Ad account: ${brief.adAccountId}`);
  if (brief.image) lines.push(`Image: ${brief.image}`);
  return lines.join("\n");
}

export function mergeBrief(base: RealtorBrief, incoming: Partial<RealtorBrief>): RealtorBrief {
  return { ...base, ...incoming };
}

export function briefFromOptions(opts: Record<string, unknown>): RealtorBrief {
  const brief: RealtorBrief = {};
  if (opts.projectName) brief.projectName = String(opts.projectName);
  if (opts.builderName) brief.builderName = String(opts.builderName);
  if (opts.propertyType) brief.propertyType = String(opts.propertyType);
  if (opts.bhk) brief.bhk = String(opts.bhk);
  if (opts.city) brief.city = String(opts.city);
  if (opts.locality) brief.locality = String(opts.locality);
  if (opts.price) brief.price = String(opts.price);
  if (opts.possession) brief.possession = String(opts.possession);
  if (opts.possessionDate) brief.possessionDate = String(opts.possessionDate);
  if (opts.dailyBudget !== undefined && opts.dailyBudget !== null && opts.dailyBudget !== "") {
    const n = Number(String(opts.dailyBudget).replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) brief.dailyBudget = n;
  }
  if (opts.pageId) brief.pageId = String(opts.pageId);
  if (opts.adAccountId) brief.adAccountId = String(opts.adAccountId);
  if (opts.whatsappNumber) brief.whatsappNumber = String(opts.whatsappNumber);
  if (opts.image) brief.image = String(opts.image);
  if (opts.message) brief.message = String(opts.message);
  if (opts.leadFormId) brief.leadFormId = String(opts.leadFormId);
  if (opts.destination) brief.destination = opts.destination === "lead_form" ? "lead_form" : "whatsapp";
  return brief;
}
