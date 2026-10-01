const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();

export function getApiUrl(): string {
  // Default to the same origin ("/api"):
  //  - in local dev, Vite proxies /api to http://localhost:3001 (see vite.config.ts)
  //  - in single-service deployments, the backend serves both the API and this app
  // Set VITE_API_URL only for split deployments (e.g. Vercel frontend + Render API).
  const base = configuredApiUrl || '/api';
  return base.replace(/\/$/, '');
}

interface FetchResult<T> {
  data: T;
  totalCount: number | null;
}

async function doFetch<T>(path: string, init?: RequestInit): Promise<FetchResult<T>> {
  let response: Response;

  try {
    response = await fetch(`${getApiUrl()}${path}`, init);
  } catch {
    throw new Error('Unable to reach the TraceDesk API. Check that the backend is running.');
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(response.ok ? 'The TraceDesk API returned malformed JSON.' : `Request failed (${response.status}).`);
  }

  if (!response.ok) {
    const message = typeof payload === 'object' && payload !== null && 'error' in payload
      ? String(payload.error)
      : `Request failed (${response.status}).`;
    throw new Error(message);
  }

  const rawTotal = response.headers?.get?.('X-Total-Count');
  const totalCount = rawTotal !== null && rawTotal !== undefined && !Number.isNaN(Number(rawTotal))
    ? Number(rawTotal)
    : null;

  return { data: payload as T, totalCount };
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  return (await doFetch<T>(path, init)).data;
}

/** Like apiFetch, but also returns X-Total-Count for paginated endpoints. */
export async function apiFetchWithMeta<T>(path: string, init?: RequestInit): Promise<FetchResult<T>> {
  return doFetch<T>(path, init);
}
