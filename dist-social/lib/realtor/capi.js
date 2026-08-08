"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports._private = void 0;
exports.sha256Hex = sha256Hex;
exports.hashUserDatum = hashUserDatum;
exports.buildUserData = buildUserData;
exports.buildLeadEvent = buildLeadEvent;
exports.sendEvent = sendEvent;
const node_crypto_1 = require("node:crypto");
function sha256Hex(value) {
    return (0, node_crypto_1.createHash)("sha256").update(value).digest("hex");
}
function hashUserDatum(value) {
    if (!value)
        return undefined;
    const normalized = String(value).trim().toLowerCase();
    if (!normalized)
        return undefined;
    return sha256Hex(normalized);
}
function buildUserData(userData = {}) {
    const out = {};
    const email = hashUserDatum(userData.email);
    const phone = hashUserDatum(userData.phone);
    const firstName = hashUserDatum(userData.firstName);
    const lastName = hashUserDatum(userData.lastName);
    if (email)
        out.em = [email];
    if (phone)
        out.ph = [phone];
    if (firstName)
        out.fn = [firstName];
    if (lastName)
        out.ln = [lastName];
    if (userData.clientIpAddress)
        out.client_ip_address = [userData.clientIpAddress];
    if (userData.clientUserAgent)
        out.client_user_agent = [userData.clientUserAgent];
    return out;
}
function buildLeadEvent(event) {
    const payload = {
        event_name: event.eventName,
        event_time: event.eventTime || Math.floor(Date.now() / 1000),
        action_source: event.actionSource || "website"
    };
    if (event.eventId)
        payload.event_id = event.eventId;
    if (event.eventSourceUrl)
        payload.event_source_url = event.eventSourceUrl;
    const userData = buildUserData(event.userData);
    payload.user_data = userData;
    if (event.customData && Object.keys(event.customData).length) {
        payload.custom_data = event.customData;
    }
    return payload;
}
async function sendEvent(executor, config, adAccountId, event) {
    const normalized = String(adAccountId || config.defaultAdAccountId || "").trim();
    if (!normalized)
        throw new Error("No ad account ID configured for Conversions API.");
    const eventPayload = buildLeadEvent(event);
    const result = await executor.post(`${normalized}/events`, {
        data: JSON.stringify([eventPayload])
    });
    const entries = Array.isArray(result.data) ? result.data : [];
    const entry = entries[0];
    return {
        eventId: String(event.eventId || eventPayload.event_name || ""),
        received: entry?.event_received === true || Boolean(entry?.event_received)
    };
}
exports._private = {
    sha256Hex,
    hashUserDatum,
    buildUserData,
    buildLeadEvent,
    sendEvent
};
