const INDUSTRIES = [
  'real_estate',
  'ecommerce',
  'edtech',
  'healthcare',
  'local_services'
];

const INDUSTRY_LABELS = {
  real_estate: 'Real Estate (India + UAE)',
  ecommerce: 'E-commerce',
  edtech: 'EdTech / Course Funnels',
  healthcare: 'Clinics / Healthcare',
  local_services: 'Local Services'
};

const CONFIDENCE_THRESHOLDS = {
  high: 0.75,
  medium: 0.45
};

const DETECTOR_VERSION = 'heuristic-v1';

const KEYWORD_RULES = [
  { pattern: /\b(real estate|property|apartment|villa|plot|bhk|sqft|rera|broker|off-plan|handover)\b/, industry: 'real_estate', weight: 0.34, reason: 'Property keywords detected' },
  { pattern: /\b(marina|downtown|jlt|business bay|dubai|uae|abu dhabi)\b/, industry: 'real_estate', weight: 0.18, reason: 'UAE real-estate locality signal detected' },
  { pattern: /\b(add to cart|checkout|purchase|sku|catalog|shop now|order now|cart|aov|roas)\b/, industry: 'ecommerce', weight: 0.34, reason: 'Commerce intent keywords detected' },
  { pattern: /\b(course|cohort|batch|webinar|masterclass|enroll|admission|syllabus|curriculum|certification)\b/, industry: 'edtech', weight: 0.34, reason: 'EdTech funnel keywords detected' },
  { pattern: /\b(clinic|doctor|dental|hospital|appointment|consultation|patient|treatment|diagnostic)\b/, industry: 'healthcare', weight: 0.34, reason: 'Healthcare service keywords detected' },
  { pattern: /\b(gym|salon|solar|cleaning|repair|plumber|electrician|home service|near me|book call|service area)\b/, industry: 'local_services', weight: 0.34, reason: 'Local service keywords detected' },
  { pattern: /\b(lead|inquiry|enquiry|book visit|site visit|viewing)\b/, industry: 'real_estate', weight: 0.16, reason: 'Lead + visit language matches real-estate funnel' },
  { pattern: /\b(call now|whatsapp now|book now|same day)\b/, industry: 'local_services', weight: 0.16, reason: 'Call/book-now language matches local-services demand capture' },
  { pattern: /\b(attendance|enrollment|enrolment|webinar attendance)\b/, industry: 'edtech', weight: 0.16, reason: 'Attendance-to-enrollment language detected' },
  { pattern: /\b(show-up|show up|follow-up|follow up|consult)\b/, industry: 'healthcare', weight: 0.14, reason: 'Appointment/show-up language detected' }
];

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function uniq(items) {
  return Array.from(new Set((items || []).filter(Boolean)));
}

function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((x) => String(x || '').trim()).filter(Boolean);
}

function normalizeIndustry(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (['real_estate', 'real-estate', 'realestate', 'property'].includes(raw)) return 'real_estate';
  if (['ecommerce', 'e-commerce', 'commerce'].includes(raw)) return 'ecommerce';
  if (['edtech', 'education', 'course', 'courses'].includes(raw)) return 'edtech';
  if (['healthcare', 'clinic', 'health'].includes(raw)) return 'healthcare';
  if (['local_services', 'local', 'services'].includes(raw)) return 'local_services';
  return '';
}

function scoreObjective(text, add) {
  const s = String(text || '').toLowerCase();
  if (!s) return;
  if (/(sales|purchase|catalog_sales|conversions?)/.test(s)) {
    add('ecommerce', 0.24, `Objective "${text}" maps to commerce outcomes`);
  }
  if (/(leads?|lead_generation)/.test(s)) {
    add('real_estate', 0.14, `Objective "${text}" is lead-centric`);
    add('edtech', 0.12, `Objective "${text}" fits lead-to-enrollment funnels`);
    add('healthcare', 0.12, `Objective "${text}" fits appointment funnels`);
    add('local_services', 0.12, `Objective "${text}" fits local lead capture`);
  }
  if (/(messages?|whatsapp)/.test(s)) {
    add('local_services', 0.16, `Objective "${text}" favors chat-to-booking businesses`);
    add('real_estate', 0.12, `Objective "${text}" is common in property inquiry funnels`);
  }
}

function scoreEvent(text, add) {
  const s = String(text || '').toLowerCase();
  if (!s) return;
  if (/(purchase|checkout|initiatecheckout|addtocart|viewcontent)/.test(s)) {
    add('ecommerce', 0.32, `Event "${text}" indicates commerce intent`);
  }
  if (/(scheduleappointment|bookappointment|appointment|consultation)/.test(s)) {
    add('healthcare', 0.28, `Event "${text}" indicates appointment workflow`);
  }
  if (/(complete_registration|registration|webinar|enroll|enrol)/.test(s)) {
    add('edtech', 0.28, `Event "${text}" indicates education funnel stages`);
  }
  if (/(lead|contact|generate_lead|submit_form)/.test(s)) {
    add('real_estate', 0.16, `Event "${text}" aligns with property lead funnels`);
    add('local_services', 0.16, `Event "${text}" aligns with local call/book funnels`);
  }
}

function scoreGeo(geo, add) {
  const s = String(geo || '').toLowerCase();
  if (!s) return;
  if (/\b(india|mumbai|delhi|gurgaon|noida|bangalore|bengaluru|pune|hyderabad)\b/.test(s)) {
    add('real_estate', 0.14, 'India geo signal favors property/local demand categories');
    add('local_services', 0.08, 'India geo signal supports local service campaigns');
  }
  if (/\b(uae|dubai|abu dhabi|sharjah)\b/.test(s)) {
    add('real_estate', 0.16, 'UAE geo signal strongly correlates with property campaigns');
  }
}

function buildCombinedText(input) {
  const parts = [
    String(input.text || ''),
    ...normalizeList(input.campaignNames),
    ...normalizeList(input.adSetNames),
    ...normalizeList(input.adNames),
    ...normalizeList(input.objectives),
    ...normalizeList(input.events),
    String(input.geo || ''),
    String(input.country || ''),
    String(input.timezone || '')
  ];
  return parts.join(' ').toLowerCase();
}

function detectIndustry(input = {}) {
  const scores = {};
  INDUSTRIES.forEach((id) => {
    scores[id] = {
      industry: id,
      label: INDUSTRY_LABELS[id],
      score: 0.02,
      reasons: []
    };
  });

  const add = (industry, weight, reason) => {
    if (!scores[industry]) return;
    const w = Number(weight || 0);
    if (w <= 0) return;
    scores[industry].score += w;
    if (reason) scores[industry].reasons.push(String(reason));
  };

  const combined = buildCombinedText(input);
  KEYWORD_RULES.forEach((rule) => {
    if (rule.pattern.test(combined)) add(rule.industry, rule.weight, rule.reason);
  });

  normalizeList(input.objectives).forEach((objective) => scoreObjective(objective, add));
  normalizeList(input.events).forEach((eventName) => scoreEvent(eventName, add));
  scoreGeo(input.geo || `${input.country || ''} ${input.timezone || ''}`, add);

  if (String(input.defaultApi || '').toLowerCase() === 'whatsapp') {
    add('local_services', 0.1, 'Default API is WhatsApp (common in local lead workflows)');
  }

  const ranked = INDUSTRIES.map((id) => {
    const entry = scores[id];
    const normalizedScore = clamp(Number(entry.score.toFixed(3)), 0.02, 0.99);
    return {
      industry: id,
      label: entry.label,
      score: normalizedScore,
      reasons: uniq(entry.reasons).slice(0, 4)
    };
  }).sort((a, b) => b.score - a.score);

  const top = ranked[0];
  const second = ranked[1] || { score: 0 };
  const margin = clamp(Number((top.score - second.score).toFixed(3)), 0, 0.99);
  const reasonCount = uniq(top.reasons).length;
  const confidence = clamp(
    Number((top.score * 0.72 + margin * 0.46 + Math.min(0.16, reasonCount * 0.03)).toFixed(3)),
    0.1,
    0.99
  );
  const confidenceBand = confidence >= CONFIDENCE_THRESHOLDS.high
    ? 'high'
    : confidence >= CONFIDENCE_THRESHOLDS.medium
      ? 'medium'
      : 'low';

  return {
    detectorVersion: DETECTOR_VERSION,
    recommended: top.industry,
    recommendedLabel: top.label,
    confidence,
    confidenceBand,
    margin,
    reasons: top.reasons,
    ranked
  };
}

module.exports = {
  INDUSTRIES,
  INDUSTRY_LABELS,
  CONFIDENCE_THRESHOLDS,
  DETECTOR_VERSION,
  normalizeIndustry,
  detectIndustry
};
