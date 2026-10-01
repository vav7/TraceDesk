# TraceDesk API Reference

Base URL: `/api` (same origin) or `VITE_API_URL` for split deployments.
Every response carries an `X-Request-Id` header (send your own to correlate).
Errors use `{ "error": "human readable message" }` with proper status codes.

## Health & meta
| Endpoint | Description |
| --- | --- |
| `GET /health` | Liveness/readiness, database mode, uptime |
| `GET /ai/status` | Whether AI runbooks are configured (`{configured, model, provider}`) |

## Realtime
| Endpoint | Description |
| --- | --- |
| `GET /events` | **SSE stream.** Events: `hello`, `telemetry`, `incident:created`, `incident:grouped`, `incident:resolved`, `incident:updated`, `runbook:created`, `webhook:received`, `system:reset`. Keep-alive comments every 25s; browsers auto-reconnect. |

## Dashboard & analytics
| Endpoint | Description |
| --- | --- |
| `GET /dashboard/stats` | Integration health counts, request totals, error rate, avg latency |
| `GET /dashboard/incidents` | 5 most recent incidents |
| `GET /dashboard/timeline?hours=24` | Hourly buckets: `{bucket, total, errors, avgLatency}` (continuous axis) |
| `GET /dashboard/health` | Per-integration: success rate, last-30 request strip, totals |

## Integrations & Lab
| Endpoint | Description |
| --- | --- |
| `GET /integrations` | Configured connectors + proof metadata: `kind` (`live`｜`simulated`), `target` host, `base_url`, `supported_scenarios`, `request_previews` (exact method+URL per scenario). `status` is **computed live** from each connector's last 10 requests (≥50% errors → failing, any → degraded, clean → active, no traffic → seeded baseline); the stored value is exposed as `stored_status` |
| `POST /integrations/:slug/simulate` | `{ "scenario": "success｜401｜403｜404｜429｜500｜timeout", "url?": "https://…", "method?": "GET", "headers?": {"Authorization": "Bearer …"} }` → runs retry/backoff, records telemetry, diagnoses, files/groups incident. Per-connector scenario support enforced (GitHub/Coinbase: real success/401/404; status-probe: full real matrix; open-meteo: real success/404; custom-endpoint: requires `url` · calls YOUR API for real; demo connectors: everything). BYO `headers` work on any connector (secrets masked in evidence; hop-by-hop headers rejected). Response includes `source` (`live`｜`simulated`), `target`, `targetUrl` and `requestSent` (exact method+URL+masked headers) proof fields. SSRF guards: http/https only, cloud metadata always blocked, private ranges need `ALLOW_PRIVATE_TARGETS=true`. Rate-limited. |

## Webhooks (public listener)
| Endpoint | Description |
| --- | --- |
| `POST /webhooks/:slug` | Ingest any JSON. Fields used: `status`/`status_code`/`code` (default 500), `event`/`type`, `error`/`message`/`text`. 4xx/5xx payloads auto-file incidents with the raw payload as evidence. Optional auth: `X-Webhook-Secret` or `Authorization: Bearer` when `WEBHOOK_SECRET` is set. Rate-limited. Returns `202`. |

## Alerts
| Endpoint | Description |
| --- | --- |
| `GET /alerts?limit=30` | Alert history: incident lifecycle events (created/grouped/resolved/status) joined with incident + integration context, newest first. Backs the header bell. |

## Telemetry
| Endpoint | Description |
| --- | --- |
| `GET /telemetry/recent?limit=10` | Latest requests with linked incident IDs |

## Incidents
| Endpoint | Description |
| --- | --- |
| `GET /incidents?limit=20&offset=0` | List (paginated; `X-Total-Count` header always set; no params = all) |
| `GET /incidents/:id` | Detail: evidence (incl. provider headers), timeline events, diagnosis, **`sla`** `{targetMinutes, elapsedMinutes, remainingMinutes, breach, met}` |
| `POST /incidents/:id/status` | `{ "status": "open"｜"investigating" }` · validated transitions (resolve via its own endpoint) |
| `POST /incidents/:id/notes` | `{ "text": "…" }` (1-2000 chars) → timeline note |
| `POST /incidents/:id/resolve` | `{ "resolution": "…" }` (optional) → resolves + timeline event |
| `GET /incidents/:id/escalation-report` | Markdown escalation report |
| `POST /incidents/:id/runbook` | `{}` deterministic (resolved only) or `{"generator":"ai"}` (any status; requires `AI_API_KEY`) |

## Runbooks
| Endpoint | Description |
| --- | --- |
| `GET /runbooks?search=` | List; rows include `generated_by` (`deterministic`｜`ai`) |
| `GET /runbooks/:id` | Detail |

## System
| Endpoint | Description |
| --- | --- |
| `POST /system/reset` | Clears all operational data (telemetry, incidents, evidence, timeline events, runbooks) for a clean demo; the connector registry is kept. Returns per-table cleared counts and broadcasts a `system:reset` SSE event so every open window refreshes. |

## SLA targets (built in)
| Severity | Response target |
| --- | --- |
| critical | 60 min |
| high | 4 h |
| medium | 8 h |
| low | 24 h |
