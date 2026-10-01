/** Single source of truth for mapping HTTP statuses to error categories. */
export function classifyError(status: number): string {
  if (status === 0) return 'timeout';
  if (status === 401) return 'authentication_failure';
  if (status === 403) return 'permission_failure';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limit';
  if (status >= 500 && status <= 599) return 'provider_failure';
  return 'unknown';
}
