export interface DiagnosisContext {
  /** Provider response headers captured as evidence (lowercased names). */
  headers?: Record<string, string>;
  /** How many attempts the retry engine made before giving up. */
  retryCount?: number;
  /** How many failures were grouped into the current incident. */
  groupedCount?: number;
}

export interface DiagnosisResult {
  category: string;
  probableCause: string;
  confidence: number;
  recommendedAction: string;
}

/** True when the provider signalled rate-limit exhaustion (429, or GitHub-style 403). */
function isRateLimited(status: number, headers?: Record<string, string>): boolean {
  if (status === 429) return true;
  return status === 403 && headers?.['x-ratelimit-remaining'] === '0';
}

/**
 * Deterministic, evidence-based diagnosis. Rules map HTTP status + provider
 * evidence (auth challenges, rate-limit headers, retry history) to a root
 * cause with a confidence score. No AI, no randomness: the same evidence
 * always produces the same diagnosis.
 */
export function diagnoseFailure(status: number, errorType?: string, context?: DiagnosisContext): DiagnosisResult {
  const headers = context?.headers ?? {};
  const retryCount = context?.retryCount ?? 0;
  const groupedCount = context?.groupedCount ?? 1;

  let result: DiagnosisResult;

  if (status === 401) {
    const challenge = headers['www-authenticate'];
    result = challenge
      ? {
        category: 'authentication_failure',
        probableCause: 'Invalid or expired API token: the provider rejected the credentials with an authentication challenge (WWW-Authenticate).',
        confidence: 0.97,
        recommendedAction: 'Rotate the integration token, then verify its expiration date and required scopes.',
      }
      : {
        category: 'authentication_failure',
        probableCause: 'Invalid API token or credentials.',
        confidence: 0.95,
        recommendedAction: 'Check and rotate the integration token.',
      };
  } else if (isRateLimited(status, headers)) {
    const retryAfter = Number(headers['retry-after']);
    const resetEpoch = Number(headers['x-ratelimit-reset']);
    const waitHint = Number.isFinite(retryAfter) && retryAfter > 0
      ? ` Honor the Retry-After header (${retryAfter}s) before the next attempt.`
      : Number.isFinite(resetEpoch) && resetEpoch > 0
        ? ` The provider rate-limit window resets at ${new Date(resetEpoch * 1000).toISOString()}.`
        : '';
    result = {
      category: 'rate_limit',
      probableCause: status === 403
        ? 'Provider rate limit exhausted: the quota header reports zero remaining requests (surfaced as HTTP 403).'
        : 'The integration has exceeded the provider rate limit.',
      confidence: 0.96,
      recommendedAction: `Implement exponential backoff and spread request volume.${waitHint}`,
    };
  } else if (status === 403) {
    result = {
      category: 'permission_failure',
      probableCause: 'The token lacks required scopes or permissions.',
      confidence: 0.9,
      recommendedAction: 'Verify the integration has the necessary OAuth scopes.',
    };
  } else if (status === 404) {
    result = {
      category: 'not_found',
      probableCause: 'The endpoint path or resource identifier does not exist: wrong URL template, renamed/moved resource, or a deleted object.',
      confidence: 0.92,
      recommendedAction: 'Verify the request path and resource IDs against the provider docs; check whether the resource was renamed, moved or deleted.',
    };
  } else if (status >= 500 && status <= 599) {
    result = {
      category: 'provider_failure',
      probableCause: 'The provider server encountered an error or is temporarily unavailable.',
      confidence: 0.85,
      recommendedAction: 'Monitor provider status page; implement retries with backoff.',
    };
  } else if (status === 0) {
    result = {
      category: 'timeout',
      probableCause: 'Request timed out due to network issues or provider slowness.',
      confidence: 0.8,
      recommendedAction: 'Increase timeout settings or check network connectivity.',
    };
  } else {
    result = {
      category: 'unknown',
      probableCause: 'Unclassified failure.',
      confidence: 0.5,
      recommendedAction: 'Investigate logs for more details.',
    };
  }

  // Evidence-based confidence/urgency adjustments (deterministic).
  if (retryCount >= 2) {
    result = {
      ...result,
      confidence: Math.min(0.99, result.confidence + 0.02),
      recommendedAction: `${result.recommendedAction} The failure persisted across ${retryCount + 1} attempts with backoff, so treat it as persistent, not transient.`,
    };
  }
  if (groupedCount >= 5) {
    result = {
      ...result,
      recommendedAction: `${result.recommendedAction} ${groupedCount} matching failures were grouped into this incident within the last window. Escalate as an ongoing outage.`,
    };
  }

  return result;
}
