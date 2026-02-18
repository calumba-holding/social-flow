import { env } from '../config/env';
import { decryptSecret } from '../security/crypto';
import { getCredential } from '../services/repository';

export interface ActionContext {
  executionId: string;
  tenantId: string;
  clientId: string;
  triggerPayload: Record<string, unknown>;
}

export interface ActionInput {
  nodeId: string;
  action: string;
  config: Record<string, unknown>;
}

function readPath(obj: Record<string, unknown>, path: string): unknown {
  return String(path || '')
    .split('.')
    .filter(Boolean)
    .reduce<unknown>((acc, key) => {
      if (!acc || typeof acc !== 'object') return undefined;
      return (acc as Record<string, unknown>)[key];
    }, obj);
}

async function whatsappAdapter(input: ActionInput, ctx: ActionContext) {
  const to = String(input.config['to'] || readPath(ctx.triggerPayload, 'lead.phone') || '').trim();
  const template = String(input.config['template'] || '').trim();
  if (!to || !template) throw new Error(`invalid_action_payload:${input.nodeId}:whatsapp.send_template`);

  if (env.EXECUTION_DRY_RUN) {
    return { action: input.action, delivered: true, dryRun: true };
  }

  const tokenRow = await getCredential({
    tenantId: ctx.tenantId,
    clientId: ctx.clientId,
    provider: 'whatsapp',
    credentialType: 'access_token'
  });
  if (!tokenRow) throw new Error('credential_missing:whatsapp.access_token');
  const token = decryptSecret(tokenRow.encrypted_secret);
  const phoneNumberId = String(input.config['phoneNumberId'] || '').trim();
  if (!phoneNumberId) throw new Error(`invalid_action_payload:${input.nodeId}:missing_phoneNumberId`);

  const res = await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: { name: template, language: { code: 'en_US' } }
    })
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`whatsapp_send_failed:${res.status}`);
  return { action: input.action, delivered: true, provider: 'meta', response: body };
}

async function emailAdapter(input: ActionInput, ctx: ActionContext) {
  const to = String(input.config['to'] || readPath(ctx.triggerPayload, 'lead.email') || '').trim();
  const template = String(input.config['template'] || '').trim();
  if (!to || !template) throw new Error(`invalid_action_payload:${input.nodeId}:email.send`);
  return { action: input.action, delivered: true, dryRun: env.EXECUTION_DRY_RUN };
}

async function crmAdapter(input: ActionInput) {
  const status = String(input.config['status'] || '').trim();
  if (!status) throw new Error(`invalid_action_payload:${input.nodeId}:crm.update_status`);
  return { action: input.action, updated: true, status };
}

export async function executeAction(input: ActionInput, ctx: ActionContext): Promise<Record<string, unknown>> {
  const action = String(input.action || '').trim().toLowerCase();
  if (!action) throw new Error(`invalid_action:missing_action_for_node:${input.nodeId}`);
  if (action === 'whatsapp.send_template') return whatsappAdapter(input, ctx);
  if (action === 'email.send') return emailAdapter(input, ctx);
  if (action === 'crm.update_status') return crmAdapter(input);
  throw new Error(`unsupported_action:${action}`);
}
