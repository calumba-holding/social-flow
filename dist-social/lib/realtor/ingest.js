"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports._private = void 0;
exports.parseProjectName = parseProjectName;
exports.pickPrimaryImage = pickPrimaryImage;
exports.buildIngestResult = buildIngestResult;
exports.formatIngestBrief = formatIngestBrief;
exports.sourceFromUrl = sourceFromUrl;
exports.scrapeListing = scrapeListing;
exports.ingestListingUrl = ingestListingUrl;
const { loadPlaywrightOrThrow } = require("../playwright-runtime.js");
const brief_js_1 = require("./brief.js");
const LISTING_SITE_PATTERN = /\|\s*(99acres|magicbricks|housing\.com|makaan|nobroker|commonfloor|squareyards|zingat|zolo|propertywala|realestateindia)\s*$/i;
const TRACKING_IMAGE_PATTERN = /(?:logo|icon|spacer|pixel|tracking|blank|placeholder|avatar|profile|flag|1x1)/i;
const SMALL_IMAGE_SIZE = 120;
function parseProjectName(title, text = "") {
    const raw = (0, brief_js_1.normalizeText)(title || text);
    if (!raw)
        return "";
    let candidate = raw.replace(LISTING_SITE_PATTERN, "").trim();
    const inMatch = candidate.match(/(?:\b\d+(?:\.\d+)?\s*bhk\s+)?(?:apartments?|flats?|villas?|homes?|houses?|independent\s+houses?|plots?|penthouses?|residences?)\s+(?:for\s+(?:sale|rent)\s+)?(?:in|at|near)\s+([A-Za-z][A-Za-z0-9 .'/-]+?)(?=\s*[,|]|\s+(?:by|poss)\b|$)/i);
    if (inMatch && inMatch[1]) {
        const name = inMatch[1].trim().replace(/[.,!?]+$/g, "").trim();
        if (name.length >= 2)
            return name.charAt(0).toUpperCase() + name.slice(1);
    }
    const beforeCity = candidate.split(/,|\s+-\s+/i)[0].trim();
    const tokens = beforeCity.split(/\s+/);
    const knownCity = /(?:bengaluru|bangalore|mumbai|delhi|gurgaon|gurugram|noida|hyderabad|pune|chennai|kolkata)/i;
    while (tokens.length > 1 && knownCity.test(tokens[tokens.length - 1]))
        tokens.pop();
    let name = tokens.join(" ").trim();
    name = name.replace(/\s+(?:in|at|near)\s+[A-Za-z][A-Za-z0-9 .'/-]+$/i, "").trim();
    if (name.length >= 2)
        return name.charAt(0).toUpperCase() + name.slice(1);
    return "";
}
function pickPrimaryImage(images) {
    const candidates = Array.isArray(images) ? images.filter(Boolean).map(String) : [];
    for (const url of candidates) {
        const trimmed = String(url || "").trim();
        if (!/^https?:\/\//i.test(trimmed))
            continue;
        if (TRACKING_IMAGE_PATTERN.test(trimmed))
            continue;
        if (/\bdata:image\b/i.test(trimmed))
            continue;
        const sizeMatch = trimmed.match(/[?&](?:w|width|h|height)=(\d+)/i);
        if (sizeMatch && Number(sizeMatch[1]) < SMALL_IMAGE_SIZE)
            continue;
        return trimmed;
    }
    return "";
}
function cleanBriefFacts(brief) {
    const out = { ...brief };
    delete out.message;
    delete out.whatsappNumber;
    delete out.dailyBudget;
    delete out.pageId;
    delete out.adAccountId;
    delete out.leadFormId;
    delete out.destination;
    return out;
}
function buildIngestResult(scraped) {
    const combined = (0, brief_js_1.normalizeText)(`${scraped.title} ${scraped.text}`);
    const parsed = (0, brief_js_1.parseBriefText)(combined);
    const brief = cleanBriefFacts(parsed);
    const projectName = parseProjectName(scraped.title, combined);
    if (projectName)
        brief.projectName = projectName;
    const price = (0, brief_js_1.inrAmountFromText)(combined);
    if (price !== null && !brief.price) {
        brief.price = `₹${price.toLocaleString("en-IN")}`;
    }
    const images = Array.isArray(scraped.images) ? scraped.images.filter(Boolean).map(String) : [];
    const primaryImage = pickPrimaryImage(images);
    if (primaryImage && !brief.image)
        brief.image = primaryImage;
    const missing = (0, brief_js_1.requiredFields)(brief, false);
    return {
        url: String(scraped.url || ""),
        source: sourceFromUrl(scraped.url),
        title: String(scraped.title || ""),
        brief,
        formatted: formatIngestBrief(brief),
        missing,
        complete: missing.length === 0,
        images,
        primaryImage,
        text: String(scraped.text || "")
    };
}
function formatIngestBrief(brief) {
    const lines = [];
    if (brief.projectName)
        lines.push(`Project: ${brief.projectName}`);
    if (brief.builderName)
        lines.push(`Builder/agency: ${brief.builderName}`);
    const unit = [
        brief.bhk,
        brief.propertyType ? String(brief.propertyType).replace(/_/g, " ") : ""
    ].filter(Boolean).join(" ") || "property";
    lines.push(`Property: ${unit}`);
    const location = [brief.locality, brief.city].filter(Boolean).join(", ");
    if (location)
        lines.push(`Location: ${location}`);
    if (brief.price)
        lines.push(`Price: ${brief.price}`);
    if (brief.possession === "ready")
        lines.push("Possession: Ready to move in");
    else if (brief.possession === "under_construction") {
        lines.push(brief.possessionDate ? `Possession: Under construction (by ${brief.possessionDate})` : "Possession: Under construction");
    }
    else if (brief.possessionDate)
        lines.push(`Possession: ${brief.possessionDate}`);
    if (brief.image)
        lines.push(`Image: ${brief.image}`);
    return lines.join("\n");
}
function sourceFromUrl(url) {
    const raw = String(url || "").trim();
    try {
        return new URL(raw).hostname.replace(/^www\./, "");
    }
    catch {
        return "";
    }
}
function parseHttpUrl(input) {
    const raw = String(input || "").trim();
    if (!raw)
        return null;
    try {
        const url = new URL(raw);
        if (url.protocol !== "http:" && url.protocol !== "https:")
            return null;
        return url;
    }
    catch {
        return null;
    }
}
async function scrapeListing(url, options = {}) {
    const target = parseHttpUrl(url);
    if (!target)
        throw new Error("Invalid listing URL. Use a full http(s) URL to a property listing page.");
    const loadPlaywright = options.loadPlaywright || loadPlaywrightOrThrow;
    const playwright = await loadPlaywright();
    const timeoutMs = Math.max(5_000, Number(options.timeoutMs || 30_000));
    const browser = await playwright.chromium.launch({ headless: true });
    try {
        const context = await browser.newContext({
            viewport: { width: 1280, height: 900 },
            userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
        });
        const page = await context.newPage();
        await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
        await page.waitForTimeout(1_500);
        const title = String((await page.title()) || "").trim();
        const text = String((await page.evaluate(() => document.body ? document.body.innerText : "")) || "").slice(0, 200_000);
        const images = await page.evaluate(() => {
            const out = [];
            const og = document.querySelector('meta[property="og:image"]');
            if (og && og.getAttribute("content"))
                out.push(og.getAttribute("content") || "");
            document.querySelectorAll("img").forEach((img) => {
                const src = String(img.currentSrc || img.src || "").trim();
                if (src)
                    out.push(src);
            });
            return out;
        });
        return {
            url: target.href,
            title,
            text,
            images: Array.isArray(images) ? images.slice(0, 50) : []
        };
    }
    finally {
        await browser.close();
    }
}
async function ingestListingUrl(url, options = {}) {
    const scraped = await scrapeListing(url, options);
    return buildIngestResult(scraped);
}
exports._private = {
    cleanBriefFacts,
    parseHttpUrl,
    parseProjectName,
    pickPrimaryImage,
    sourceFromUrl
};
