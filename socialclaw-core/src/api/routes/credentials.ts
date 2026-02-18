import { FastifyInstance } from 'fastify';
import { assertRole } from '../../security/rbac';
import { env } from '../../config/env';
import {
  appendIntegrationVerification,
  getCredential,
  getLatestIntegrationVerification,
  saveCredential
} from '../../services/repository';
import { decryptSecret, encryptSecret } from '../../security/crypto';
import { evaluateWhatsAppContract } from '../../engine/integration-contract';

export function registerCredentialRoutes(app: FastifyInstance) {
  app.post('/v1/clients/:clientId/credentials/whatsapp', {
    schema: {
      body: {
        type: 'object',
        required: ['accessToken', 'phoneNumberId'],
        properties: {
          accessToken: { type: 'string' },
          phoneNumberId: { type: 'string' },
          wabaId: { type: 'string' }
        }
      }
    }
  }, async (req) => {
    assertRole(req.user!.role, 'admin');
    const params = req.params as { clientId: string };
    const body = req.body as { accessToken: string; phoneNumberId: string; wabaId?: string };
    const encryptedSecret = encryptSecret(body.accessToken);
    const out = await saveCredential({
      tenantId: req.user!.tenantId,
      clientId: params.clientId,
      provider: 'whatsapp',
      credentialType: 'access_token',
      encryptedSecret,
      userId: req.user!.userId
    });
    await saveCredential({
      tenantId: req.user!.tenantId,
      clientId: params.clientId,
      provider: 'whatsapp',
      credentialType: 'phone_number_id',
      encryptedSecret: encryptSecret(body.phoneNumberId),
      userId: req.user!.userId
    });
    if (body.wabaId) {
      await saveCredential({
        tenantId: req.user!.tenantId,
        clientId: params.clientId,
        provider: 'whatsapp',
        credentialType: 'waba_id',
        encryptedSecret: encryptSecret(body.wabaId),
        userId: req.user!.userId
      });
    }
    return {
      credential: out,
      sampleResponse: {
        connected: true,
        verified: Boolean(body.phoneNumberId),
        testSendPassed: false
      }
    };
  });

  app.post('/v1/clients/:clientId/credentials/whatsapp/rotate', {
    schema: {
      body: {
        type: 'object',
        required: ['accessToken'],
        properties: { accessToken: { type: 'string' } }
      }
    }
  }, async (req) => {
    assertRole(req.user!.role, 'admin');
    const params = req.params as { clientId: string };
    const body = req.body as { accessToken: string };
    const out = await saveCredential({
      tenantId: req.user!.tenantId,
      clientId: params.clientId,
      provider: 'whatsapp',
      credentialType: 'access_token',
      encryptedSecret: encryptSecret(body.accessToken),
      userId: req.user!.userId
    });
    return { rotated: true, credential: out };
  });

  app.get('/v1/clients/:clientId/credentials/whatsapp/status', async (req) => {
    assertRole(req.user!.role, 'viewer');
    const params = req.params as { clientId: string };
    const token = await getCredential({
      tenantId: req.user!.tenantId,
      clientId: params.clientId,
      provider: 'whatsapp',
      credentialType: 'access_token'
    });
    const phone = await getCredential({
      tenantId: req.user!.tenantId,
      clientId: params.clientId,
      provider: 'whatsapp',
      credentialType: 'phone_number_id'
    });
    const latest = await getLatestIntegrationVerification({
      tenantId: req.user!.tenantId,
      clientId: params.clientId,
      provider: 'whatsapp',
      checkType: 'test_send_live'
    });
    const contract = evaluateWhatsAppContract({
      hasAccessToken: Boolean(token),
      hasPhoneNumberId: Boolean(phone),
      latestLiveVerificationOk: latest?.status === 'passed',
      latestLiveVerificationAt: latest?.created_at || '',
      maxAgeDays: env.WHATSAPP_VERIFICATION_MAX_AGE_DAYS
    });
    return {
      provider: 'whatsapp',
      contract,
      latestVerification: latest
        ? {
            id: latest.id,
            status: latest.status,
            createdAt: latest.created_at
          }
        : null
    };
  });

  app.post('/v1/clients/:clientId/credentials/whatsapp/verify', {
    schema: {
      body: {
        type: 'object',
        required: ['testRecipient'],
        properties: {
          testRecipient: { type: 'string' },
          template: { type: 'string' },
          language: { type: 'string' },
          mode: { type: 'string', enum: ['dry_run', 'live'] }
        }
      }
    }
  }, async (req) => {
    assertRole(req.user!.role, 'admin');
    const params = req.params as { clientId: string };
    const body = req.body as {
      testRecipient: string;
      template?: string;
      language?: string;
      mode?: 'dry_run' | 'live';
    };

    const token = await getCredential({
      tenantId: req.user!.tenantId,
      clientId: params.clientId,
      provider: 'whatsapp',
      credentialType: 'access_token'
    });
    const phone = await getCredential({
      tenantId: req.user!.tenantId,
      clientId: params.clientId,
      provider: 'whatsapp',
      credentialType: 'phone_number_id'
    });
    const mode = body.mode || 'dry_run';
    const checks: Array<Record<string, unknown>> = [
      { key: 'connected', ok: Boolean(token), detail: token ? 'Access token present.' : 'Missing WhatsApp access token.' },
      { key: 'verified', ok: Boolean(phone), detail: phone ? 'Phone number id present.' : 'Missing WhatsApp phone number id.' }
    ];

    let verificationStatus: 'passed' | 'failed' | 'partial' = 'failed';
    let evidence: Record<string, unknown> = { mode };

    if (!token || !phone) {
      verificationStatus = 'failed';
    } else if (mode === 'live' && !env.VERIFY_ALLOW_LIVE) {
      checks.push({
        key: 'test_send_live',
        ok: false,
        detail: 'Live verification is disabled by VERIFY_ALLOW_LIVE=false.'
      });
      verificationStatus = 'failed';
    } else if (mode === 'dry_run') {
      checks.push({
        key: 'test_send_live',
        ok: false,
        detail: 'Dry run completed. Run mode=live to satisfy test-send pass contract.'
      });
      verificationStatus = 'partial';
    } else {
      const accessToken = decryptSecret(token.encrypted_secret);
      const phoneNumberId = decryptSecret(phone.encrypted_secret);
      const res = await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(phoneNumberId)}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: String(body.testRecipient || '').trim(),
          type: 'template',
          template: {
            name: String(body.template || 'hello_world').trim(),
            language: { code: String(body.language || 'en_US').trim() || 'en_US' }
          }
        })
      });
      const responseBody = await res.json().catch(() => ({}));
      evidence = {
        ...evidence,
        httpStatus: res.status,
        response: responseBody
      };
      checks.push({
        key: 'test_send_live',
        ok: res.ok,
        detail: res.ok ? 'Live test-send succeeded.' : `Live test-send failed (${res.status}).`
      });
      verificationStatus = res.ok ? 'passed' : 'failed';
    }

    const row = await appendIntegrationVerification({
      tenantId: req.user!.tenantId,
      clientId: params.clientId,
      provider: 'whatsapp',
      checkType: 'test_send_live',
      status: verificationStatus,
      checks,
      evidence,
      initiatedBy: req.user!.userId
    });

    return {
      ok: verificationStatus === 'passed',
      verification: {
        id: row.id,
        createdAt: row.created_at,
        status: verificationStatus,
        checks,
        evidence
      }
    };
  });
}
