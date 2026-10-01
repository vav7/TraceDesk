import { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { getApiUrl } from './api';

export interface StreamEvent {
  id: number;
  type: 'telemetry' | 'incident:created' | 'incident:grouped' | 'incident:resolved' | 'incident:updated' | 'runbook:created' | 'webhook:received' | 'system:reset';
  payload: Record<string, unknown> | null;
  at: number;
}

export type StreamStatus = 'connecting' | 'live' | 'offline';

interface EventStreamValue {
  status: StreamStatus;
  events: StreamEvent[];
  lastEvent: StreamEvent | null;
}

const EventStreamContext = createContext<EventStreamValue | null>(null);

const EVENT_TYPES: StreamEvent['type'][] = [
  'telemetry',
  'incident:created',
  'incident:grouped',
  'incident:resolved',
  'incident:updated',
  'runbook:created',
  'webhook:received',
  'system:reset',
];

/**
 * Connects once per app to the backend SSE stream (`/api/events`) and shares
 * live domain events with every subscriber (dashboard feed, toasts, Lab
 * telemetry, header status). EventSource reconnects automatically; the
 * status flag reflects the live connection state.
 */
export function EventStreamProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<StreamStatus>('connecting');
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const idRef = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.EventSource !== 'function') {
      setStatus('offline');
      return;
    }

    const source = new window.EventSource(`${getApiUrl()}/events`);

    source.onopen = () => setStatus('live');
    source.onerror = () => setStatus('offline');

    const push = (type: StreamEvent['type']) => (event: MessageEvent) => {
      let payload: Record<string, unknown> | null = null;
      try {
        payload = JSON.parse(event.data) as Record<string, unknown>;
      } catch {
        payload = null;
      }
      idRef.current += 1;
      const streamEvent: StreamEvent = { id: idRef.current, type, payload, at: Date.now() };
      setStatus('live');
      // A workspace reset invalidates everything already in the feed:
      // keep only the reset entry itself as the audit trail.
      setEvents((prev) => (type === 'system:reset' ? [streamEvent] : [streamEvent, ...prev].slice(0, 40)));
    };

    const listeners = new Map<string, (event: MessageEvent) => void>();
    for (const type of EVENT_TYPES) {
      const listener = push(type);
      listeners.set(type, listener);
      source.addEventListener(type, listener as EventListener);
    }
    source.addEventListener('hello', () => setStatus('live'));

    return () => {
      for (const [type, listener] of listeners) {
        source.removeEventListener(type, listener as EventListener);
      }
      source.close();
    };
  }, []);

  const value = useMemo<EventStreamValue>(
    () => ({ status, events, lastEvent: events[0] ?? null }),
    [status, events],
  );

  return <EventStreamContext.Provider value={value}>{children}</EventStreamContext.Provider>;
}

/**
 * Consumer hook. Returns an inert offline state when rendered without the
 * provider (unit tests, storybook-style isolation) so components never crash.
 */
export function useEventStream(): EventStreamValue {
  return useContext(EventStreamContext) ?? { status: 'offline', events: [], lastEvent: null };
}
