import { FastifyInstance } from 'fastify';
import { assertRole } from '../../security/rbac';
import { createReleaseSignoff, getLatestReleaseSignoff, writeAudit } from '../../services/repository';

export function registerReleaseRoutes(app: FastifyInstance) {
  app.post('/v1/releases/signoff', {
    schema: {
      body: {
        type: 'object',
        required: ['clientId', 'releaseTag', 'reportSha256', 'reportPath'],
        properties: {
          clientId: { type: 'string' },
          releaseTag: { type: 'string' },
          reportSha256: { type: 'string' },
          reportPath: { type: 'string' },
          status: { type: 'string', enum: ['approved', 'rejected'] },
          notes: { type: 'string' },
          metadata: { type: 'object', additionalProperties: true }
        }
      }
    }
  }, async (req) => {
    assertRole(req.user!.role, 'owner');
    const body = req.body as {
      clientId: string;
      releaseTag: string;
      reportSha256: string;
      reportPath: string;
      status?: 'approved' | 'rejected';
      notes?: string;
      metadata?: Record<string, unknown>;
    };

    const row = await createReleaseSignoff({
      tenantId: req.user!.tenantId,
      clientId: body.clientId,
      releaseTag: String(body.releaseTag || '').trim(),
      reportSha256: String(body.reportSha256 || '').trim(),
      reportPath: String(body.reportPath || '').trim(),
      status: body.status || 'approved',
      notes: body.notes || '',
      approvedBy: req.user!.userId,
      metadata: body.metadata || {}
    });

    await writeAudit({
      tenantId: req.user!.tenantId,
      actorUserId: req.user!.userId,
      action: 'release.signoff',
      resourceType: 'release',
      resourceId: row.id,
      reason: body.notes || `Release signoff ${row.release_tag}`,
      metadata: {
        clientId: body.clientId,
        releaseTag: row.release_tag,
        status: row.status,
        reportSha256: row.report_sha256,
        reportPath: row.report_path
      }
    });

    return { signoff: row };
  });

  app.get('/v1/releases/signoff/latest', {
    schema: {
      querystring: {
        type: 'object',
        required: ['clientId'],
        properties: {
          clientId: { type: 'string' }
        }
      }
    }
  }, async (req) => {
    assertRole(req.user!.role, 'viewer');
    const query = req.query as { clientId: string };
    const signoff = await getLatestReleaseSignoff({
      tenantId: req.user!.tenantId,
      clientId: String(query.clientId || '').trim()
    });
    return { signoff };
  });
}
