import { evaluateWhatsAppContract } from '../src/engine/integration-contract';

describe('integration contract', () => {
  it('marks contract ready only for recent passed live verification', () => {
    const now = new Date().toISOString();
    const out = evaluateWhatsAppContract({
      hasAccessToken: true,
      hasPhoneNumberId: true,
      latestLiveVerificationOk: true,
      latestLiveVerificationAt: now,
      maxAgeDays: 30
    });
    expect(out.ready).toBe(true);
    expect(out.testSendPassed).toBe(true);
  });

  it('marks stale verification as not ready', () => {
    const old = new Date(Date.now() - (40 * 24 * 60 * 60 * 1000)).toISOString();
    const out = evaluateWhatsAppContract({
      hasAccessToken: true,
      hasPhoneNumberId: true,
      latestLiveVerificationOk: true,
      latestLiveVerificationAt: old,
      maxAgeDays: 30
    });
    expect(out.stale).toBe(true);
    expect(out.ready).toBe(false);
  });
});
