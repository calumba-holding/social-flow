import { FastifyInstance } from 'fastify';
import { assertRole } from '../../security/rbac';
import { saveCredential } from '../../services/repository';
import { encryptSecret } from '../../security/crypto';

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
}
