import { Request, Response } from 'express';
import { getStats, getRecentIncidents, getTimeline, getIntegrationHealth } from '../services/dashboardService';

export const stats = async (_req: Request, res: Response) => {
  res.json(await getStats());
};

export const recentIncidents = async (_req: Request, res: Response) => {
  res.json(await getRecentIncidents());
};

export const timeline = async (req: Request, res: Response) => {
  const hours = Number(req.query.hours) || 24;
  res.json(await getTimeline(hours));
};

export const integrationHealth = async (_req: Request, res: Response) => {
  res.json(await getIntegrationHealth());
};
