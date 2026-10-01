import { Integration } from './types';
import { GitHub } from './GitHub';
import { Coinbase } from './Coinbase';
import { StatusProbe } from './StatusProbe';
import { OpenMeteo } from './OpenMeteo';
import { CustomEndpoint } from './CustomEndpoint';
import { SlackMock } from './SlackMock';
import { JiraMock } from './JiraMock';
import { StripeMock } from './StripeMock';
import { SendGridMock } from './SendGridMock';
import { TwilioMock } from './TwilioMock';

/**
 * Connector registry: 5 LIVE integrations (real HTTPS calls, including the
 * bring-your-own Custom Endpoint) and 5 SIMULATED deterministic demos —
 * a deliberate 50/50 split so the platform can prove the difference between
 * reproduced real failures and simulated ones.
 */
const integrations: Integration[] = [
  new GitHub(),
  new Coinbase(),
  new StatusProbe(),
  new OpenMeteo(),
  new CustomEndpoint(),
  new SlackMock(),
  new JiraMock(),
  new StripeMock(),
  new SendGridMock(),
  new TwilioMock(),
];

export function getIntegration(slug: string): Integration | undefined {
  return integrations.find(i => i.slug === slug);
}

export function getAllIntegrations(): Integration[] {
  return integrations;
}
