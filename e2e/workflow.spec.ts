import { test, expect } from '@playwright/test';

/**
 * Happy-path E2E for the core support workflow:
 * simulate a real failure → incident with evidence → escalation report →
 * investigation lifecycle (status + note) → resolve → runbook.
 */
test('core workflow: simulate → incident → escalate → investigate → resolve → runbook', async ({ page }) => {
  await page.goto('/lab');

  // The premium splash screen fades out after ~2s.
  await expect(page.getByLabel('Loading TraceDesk')).toBeHidden({ timeout: 15_000 });

  // Slack Demo + 401 are preselected. Run the simulation.
  await page.getByRole('button', { name: 'Simulate Failure' }).click();
  await expect(
    page.getByText(/Incident #\d+ created|Grouped into incident #\d+/),
  ).toBeVisible({ timeout: 15_000 });

  // Open the incident.
  await page.getByRole('button', { name: /View incident/ }).click();
  await expect(page.getByText('Impact and diagnosis')).toBeVisible();
  await expect(page.getByText('Probable root cause')).toBeVisible();

  // Escalation report modal.
  await page.getByRole('button', { name: 'Create engineering escalation' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Engineering Escalation Report');
  await page.getByLabel('Close report').click();
  await expect(dialog).toBeHidden();

  // Lifecycle: start investigating.
  await page.getByRole('button', { name: 'Start investigation' }).click();
  await expect(page.getByLabel('Status: investigating').first()).toBeVisible();

  // Add a note — it lands in the timeline.
  await page.getByLabel('Add investigation note').fill('Rotating the integration token; monitoring for recovery.');
  await page.getByRole('button', { name: 'Add note to timeline' }).click();
  await expect(page.getByText('Rotating the integration token')).toBeVisible();

  // Resolve.
  await page.getByRole('button', { name: 'Resolve incident' }).click();
  await expect(page.getByLabel('Status: resolved').first()).toBeVisible({ timeout: 15_000 });

  // Generate the runbook.
  await page.getByRole('button', { name: 'Generate runbook' }).click();
  await expect(page).toHaveURL(/\/runbooks\/\d+/);
  await expect(page.getByRole('heading', { name: 'Problem' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Prevention' })).toBeVisible();
});

test('webhook ingestion files an incident visible in the UI', async ({ page, request }) => {
  // Unique marker per run: robust against server reuse + alert grouping
  // (a grouped delivery still attaches this payload as fresh evidence).
  const marker = `e2e-outage-${Date.now()}`;
  const res = await request.post('/api/webhooks/jira-demo', {
    data: { event: 'e2e_monitor_alert', status: 503, error: marker },
  });
  expect(res.status()).toBe(202);
  const body = await res.json();
  expect(body.incident).toBeTruthy();

  await page.goto(`/incidents/${body.incident.id}`);
  await expect(page.getByLabel('Loading TraceDesk')).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText(marker)).toBeVisible();
  await expect(page.getByLabel('Severity: critical').first()).toBeVisible();
});
