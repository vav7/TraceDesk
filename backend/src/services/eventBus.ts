import { EventEmitter } from 'events';

/**
 * Process-wide event bus. Services publish domain events here; the SSE
 * endpoint (routes/events.ts) streams them to every connected browser,
 * which is what makes the dashboard update live while simulations run.
 */
export const EVENT_NAMES = [
  'telemetry',
  'incident:created',
  'incident:grouped',
  'incident:resolved',
  'incident:updated',
  'runbook:created',
  'webhook:received',
  'system:reset',
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

class TraceDeskBus extends EventEmitter {
  publish(event: EventName, payload: unknown): void {
    this.emit(event, payload);
  }
}

export const bus = new TraceDeskBus();
// Dashboards, tabs and tests can attach many listeners; avoid Node warnings.
bus.setMaxListeners(200);
