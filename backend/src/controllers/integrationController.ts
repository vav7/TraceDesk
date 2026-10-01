import { Request, Response } from 'express';
import { pool } from '../config/db';
import { getIntegration } from '../integrations';
import { getEffectiveStatuses } from '../services/dashboardService';

/** Connector metadata that proves where requests actually go. */
export function connectorMeta(slug: string) {
  const connector = getIntegration(slug);
  if (!connector) {
    return { kind: null, target: null, base_url: null, supported_scenarios: null, request_previews: null };
  }
  const previews: Record<string, { method: string; url: string; live: boolean }> = {};
  if (connector.slug === 'custom-endpoint') {
    previews.success = { method: 'GET', url: '<the URL you provide>', live: true };
  } else {
    for (const scenario of connector.supportedScenarios) {
      const plan = connector.planRequest(scenario);
      previews[scenario] = connector.kind === 'live'
        ? { method: plan.method, url: `${connector.baseUrl}${plan.endpoint}`, live: true }
        : { method: plan.method, url: `${plan.endpoint} (in-process simulator)`, live: false };
    }
  }
  return {
    kind: connector.kind,
    target: connector.target,
    base_url: connector.baseUrl ?? null,
    supported_scenarios: connector.supportedScenarios,
    request_previews: previews,
  };
}

export const getAll = async (req: Request, res: Response) => {
  const [result, effective] = await Promise.all([
    pool.query('SELECT * FROM integrations ORDER BY id'),
    getEffectiveStatuses(),
  ]);
  res.json(result.rows.map((row: { id: number; slug: string; status: string }) => ({
    ...row,
    stored_status: row.status,
    status: effective.get(row.id) ?? row.status, // live, traffic-computed
    ...connectorMeta(row.slug),
  })));
};
