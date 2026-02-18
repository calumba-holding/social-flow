export interface WhatsAppContractInput {
  hasAccessToken: boolean;
  hasPhoneNumberId: boolean;
  latestLiveVerificationOk: boolean;
  latestLiveVerificationAt?: string;
  maxAgeDays: number;
}

export function evaluateWhatsAppContract(input: WhatsAppContractInput) {
  const connected = input.hasAccessToken;
  const verified = input.hasPhoneNumberId;
  const ts = Date.parse(String(input.latestLiveVerificationAt || ''));
  const maxAgeMs = Math.max(1, Number(input.maxAgeDays || 30)) * 24 * 60 * 60 * 1000;
  const stale = Number.isFinite(ts) ? (Date.now() - ts > maxAgeMs) : true;
  const testSendPassed = Boolean(input.latestLiveVerificationOk) && !stale;
  return {
    connected,
    verified,
    testSendPassed,
    stale,
    ready: connected && verified && testSendPassed
  };
}
