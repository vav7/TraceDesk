import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight, BookOpen, Braces, Check, CheckCircle2, ChevronDown, CircuitBoard,
  CircleDot, Cpu, Database, FlaskConical, Globe, Layers, Plus, Radio,
  ScanLine, Sparkles, Webhook,
} from 'lucide-react';
import ResetDataButton from '../components/ResetDataButton';
import KindBadge from '../components/ui/KindBadge';
import Reveal from '../components/motion/Reveal';
import SplitText from '../components/motion/SplitText';
import TiltCard from '../components/motion/TiltCard';
import { scrollToSection } from '../lib/scrollToSection';

/* ── FAQ content ─────────────────────────────────────────────────── */
interface FaqItem { q: string; a: string[] }
interface FaqGroup { id: string; title: string; items: FaqItem[] }

const FAQ_GROUPS: FaqGroup[] = [
  {
    id: 'about',
    title: 'About TraceDesk',
    items: [
      { q: 'What is TraceDesk?', a: ['TraceDesk is a SaaS integration troubleshooting platform: it reproduces integration failures, records request telemetry, auto-files incidents with evidence, diagnoses probable root causes, generates engineering escalations, and turns resolved incidents into runbooks.', 'It is built as a portfolio piece for Product Support / Technical Account Manager engineering: the entire loop a support engineer runs during a customer-facing outage.'] },
      { q: 'What is the core workflow?', a: ['Dashboard → Troubleshooting Lab → pick a connector and failure scenario → run it → inspect telemetry and the request ID → open the auto-created incident → review evidence and diagnosis → escalate or investigate → resolve → generate a runbook.', 'Every step writes to the same audit trail, so any outcome can be explained with evidence afterwards.'] },
      { q: 'What is the technology stack?', a: ['Frontend: React 18, TypeScript, Vite, Tailwind CSS, Inter + Geist Mono typefaces, lucide and simple-icons marks.', 'Backend: Node.js, Express, TypeScript, node-postgres; Server-Sent Events for realtime; an in-memory PostgreSQL (pg-mem) for zero-config mode.', 'Quality: Vitest + Supertest + React Testing Library suites, Playwright end-to-end tests, GitHub Actions CI.'] },
    ],
  },
  {
    id: 'connectors',
    title: 'Real vs simulated connectors',
    items: [
      { q: 'How do I know which integrations are real?', a: ['Every connector is badged. LIVE API means requests genuinely leave the server over HTTPS to the real provider (GitHub, Coinbase, httpbin.org, Open-Meteo, or your own URL). SIMULATED means a deterministic in-process connector that reproduces failures on demand.', 'The badge appears on the Integrations cards, in the Lab selector, on every simulation result, and inside stored evidence.'] },
      { q: 'Which real failures can be reproduced?', a: ['GitHub and Coinbase: real 401 (invalid or missing credentials) and real 404. HTTP Status Probe: the full real matrix, 401/403/404/429/500 plus a genuine timeout. Open-Meteo: real success and real 404.', 'Simulated connectors cover the complete matrix deterministically, because real providers cannot be forced to fail on demand.'] },
      { q: 'Can I verify liveness with my own credentials?', a: ['Yes. On any LIVE connector, open "Bring your own headers" and paste, for example, a real GitHub token. Selecting the 401 scenario then returns 200 with your account details, proving the failure reproduction was genuinely credential-driven.', 'Secrets are masked in all stored evidence and never persisted in full.'] },
      { q: 'What is the Custom Endpoint (BYO) connector?', a: ['It calls any URL you provide (your own service, webhook.site, a vendor sandbox) and captures the genuine response through the same pipeline: telemetry, diagnosis, incident, evidence.', 'It is SSRF-hardened: only http/https, cloud-metadata hosts always blocked, private ranges require an explicit server flag.'] },
    ],
  },
  {
    id: 'pipeline',
    title: 'Simulations, webhooks and live updates',
    items: [
      { q: 'What happens when I run a simulation?', a: ['The connector is called (with retry and exponential backoff for transient failures), every attempt is recorded as telemetry with a request ID, failures are diagnosed by deterministic rules, and an incident is opened in a single database transaction with the raw response attached as evidence.'] },
      { q: 'What are webhooks in TraceDesk?', a: ['Each integration exposes POST /api/webhooks/:slug. Any external system can push JSON events there; failures (4xx/5xx) auto-file incidents with the raw payload as evidence. The Integrations page can send a test delivery with one click.'] },
      { q: 'How do live updates work without refreshing?', a: ['The backend publishes every domain event on an internal bus and streams it to browsers over Server-Sent Events. Dashboard metrics, the activity feed, telemetry tables, toasts and the alert bell all update in realtime. No polling is involved.'] },
    ],
  },
  {
    id: 'incidents',
    title: 'Incidents, SLAs and runbooks',
    items: [
      { q: 'How are incidents diagnosed?', a: ['A deterministic rules engine maps status codes plus provider evidence (WWW-Authenticate, Retry-After, rate-limit headers, retry history) to a root cause and confidence score. The same evidence always yields the same diagnosis.'] },
      { q: 'Why do repeated failures create one incident?', a: ['Alert grouping: identical failures (same connector, same error type) inside a 10-minute window attach to the existing open incident as extra evidence with a "grouped" timeline entry, instead of spamming duplicates.'] },
      { q: 'What are the SLA targets?', a: ['Critical 1 hour, High 4 hours, Medium 8 hours, Low 24 hours. The incident page shows remaining time live, and flags breaches; resolved incidents record whether the target was met.'] },
      { q: 'What are runbooks, and what does the AI option do?', a: ['Runbooks document a resolved incident as reusable guidance: problem, symptoms, likely cause, verification, resolution, workaround, prevention.', 'With an optional free LLM key configured on the backend, an AI draft can be generated (even for open incidents). AI output is schema-validated, falls back to deterministic values per field, and is always badged with its provenance.'] },
    ],
  },
  {
    id: 'data',
    title: 'Data, resets and persistence',
    items: [
      { q: 'Where does the data live?', a: ['By default in an in-memory PostgreSQL that is migrated and seeded automatically at startup: zero configuration, resets on restart. Set DATABASE_URL to run against real PostgreSQL (Supabase, Neon, local) with automatic migration and seeding.'] },
      { q: 'How do I clear everything for a fresh demo?', a: ['Use "Clear all logs" (top right of this page, or on the Dashboard). Telemetry, incidents, evidence and runbooks are wiped in one transaction; integrations remain. All open windows update instantly via the realtime stream.'] },
    ],
  },
  {
    id: 'deploy',
    title: 'Deployment',
    items: [
      { q: 'What are the deployment options?', a: ['Single service on Render via the included Blueprint; Docker image with a healthcheck; or split: static frontend on Vercel with the API on Render and PostgreSQL on Supabase.'] },
      { q: 'Why does a deployed free instance sometimes wait before loading?', a: ['Free tiers sleep when idle; the first request wakes the container. The included keep-warm workflow pings the health endpoint periodically so visitors rarely see a cold start, and the app shows a branded "waking the backend" screen while it boots.'] },
    ],
  },
];

const TOC = [
  { id: 'pipeline', label: 'The signature' },
  { id: 'about', label: 'Product story' },
  { id: 'incidents', label: 'Core workflow' },
  { id: 'connectors', label: 'Live vs simulated' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'stack', label: 'The exchange' },
  { id: 'faq', label: 'FAQ' },
];

const WORKFLOW = [
  { step: 'Detect', text: 'Live telemetry, webhooks and health checks surface anomalies.' },
  { step: 'Reproduce', text: 'The Lab replays the failure deterministically or against the real API.' },
  { step: 'Capture', text: 'Every attempt becomes telemetry; failures attach raw evidence.' },
  { step: 'Diagnose', text: 'Rules engine maps evidence to cause and confidence.' },
  { step: 'Resolve', text: 'Lifecycle, notes and SLA timers track the fix to closure.' },
  { step: 'Document', text: 'Resolved incidents compile into reusable runbooks.' },
];

/* ── The signature: Request → Telemetry → Incident → Evidence → Diagnosis ── */
const SIGNATURE_STAGES = [
  { label: 'Request', detail: 'HTTP leaves the client', icon: Globe, tone: 'text-accent-ink', chip: 'border-accent/35 bg-accent/[0.08]' },
  { label: 'Telemetry', detail: 'attempts + request ID', icon: Radio, tone: 'text-accent3-ink', chip: 'border-accent3/35 bg-accent3/[0.08]' },
  { label: 'Incident', detail: 'transactional filing', icon: CircleDot, tone: 'text-accent2-ink', chip: 'border-accent2/35 bg-accent2/[0.08]' },
  { label: 'Evidence', detail: 'raw provider truth', icon: Braces, tone: 'text-accent3-ink', chip: 'border-accent3/35 bg-accent3/[0.08]' },
  { label: 'Diagnosis', detail: 'deterministic cause', icon: ScanLine, tone: 'text-accent-ink', chip: 'border-accent/35 bg-accent/[0.08]' },
] as const;

const ARCH_TIERS = [
  {
    id: 't1',
    tag: 'PLANE 01',
    name: 'Client',
    nodes: [
      { label: 'Browser', detail: 'Inter UI · Geist Mono', icon: Globe },
      { label: 'React Workspace', detail: 'Vite SPA · realtime context', icon: Layers },
    ],
  },
  {
    id: 't2',
    tag: 'PLANE 02',
    name: 'Control',
    nodes: [
      { label: 'Express API', detail: 'REST · zod · request IDs', icon: Cpu },
      { label: 'Diagnosis Engine', detail: 'deterministic rules', icon: ScanLine },
    ],
  },
  {
    id: 't3',
    tag: 'PLANE 03',
    name: 'Data + Edge',
    nodes: [
      { label: 'PostgreSQL', detail: 'pg-mem zero-config mode', icon: Database },
      { label: 'Connectors', detail: '5 live · 5 simulated', icon: Webhook },
    ],
  },
];

/* Real dependency composition - counted directly from package.json and
   backend/package.json. 43 direct dependencies, four groups, four hues.
   Nothing on this board is estimated. */
interface DepGroup { id: string; name: string; note: string; count: number; color: string; pkgs: string[] }
const DEP_GROUPS: DepGroup[] = [
  {
    id: 'be', name: 'Backend core', note: 'Express API · PostgreSQL · validation', count: 9, color: '#F5A524',
    pkgs: ['express', 'pg', 'pg-mem', 'zod', 'helmet', 'cors', 'express-rate-limit', 'dotenv', 'uuid'],
  },
  {
    id: 'fe', name: 'Frontend runtime', note: 'React SPA · icons · variable fonts', count: 7, color: '#22D3EE',
    pkgs: ['react', 'react-dom', 'react-router-dom', 'lucide-react', 'simple-icons', 'inter', 'geist-mono'],
  },
  {
    id: 'fet', name: 'Build & test tooling', note: 'Vite · Tailwind · the whole Vitest/RTL rig', count: 16, color: '#A78BFA',
    pkgs: ['vite', 'tailwindcss', 'typescript', 'vitest', 'postcss', 'autoprefixer', 'jsdom', 'concurrently', 'testing-library', '@vitejs', '@types/*', 'playwright'],
  },
  {
    id: 'bet', name: 'API tooling & E2E', note: 'ts-node-dev · Supertest · API type layer', count: 11, color: '#34D399',
    pkgs: ['ts-node-dev', 'ts-node', 'supertest', 'vitest', 'typescript', '@types/express', '@types/pg', '@types/cors', '@types/supertest', '@types/uuid', '@types/node'],
  },
];
const DEP_TOTAL = DEP_GROUPS.reduce((sum, g) => sum + g.count, 0); // 43
const depPct = (n: number) => Math.round((n / DEP_TOTAL) * 100);

function useOnScreen<T extends HTMLElement>(rootMargin = '64px 0px') {
  const ref = useRef<T>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setOn(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setOn(entry.isIntersecting);
      },
      { rootMargin, threshold: 0.12 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);
  return { ref, on };
}

/* ── Live latency trace: deterministic walk, scanline sweep ──────── */
function LiveTraceChart() {
  const points = useMemo(() => {
    let v = 46;
    return Array.from({ length: 56 }, (_, i) => {
      v = Math.max(14, Math.min(86, v + Math.sin(i * 0.55) * 7 + (((i * 37) % 11) - 5)));
      return v;
    });
  }, []);
  const w = 320;
  const h = 64;
  const step = w / (points.length - 1);
  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)} ${(h - (p / 100) * h).toFixed(1)}`)
    .join(' ');
  const area = `${line} L ${w} ${h} L 0 ${h} Z`;
  return (
    <div className="relative mt-3 overflow-hidden rounded-ctl border border-diagline bg-diagnostic/70 px-1 pt-1">
      <div className="flex items-center justify-between px-2 pt-1 font-mono text-mono-micro font-bold uppercase tracking-[0.14em] text-diag3">
        <span>latency · p50 24h</span>
        <span className="text-diag1">182ms <span className="text-success-ink">▼ 4%</span></span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-16 w-full" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="td-trace-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--td-accent))" stopOpacity="0.3" />
            <stop offset="100%" stopColor="rgb(var(--td-accent))" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#td-trace-fill)" />
        <path d={line} fill="none" stroke="rgb(var(--td-accent) / 0.85)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        <g className="td-trace-scan">
          <line x1="0" y1="0" x2="0" y2={h} stroke="rgb(var(--td-accent-3) / 0.55)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        </g>
      </svg>
    </div>
  );
}

/* ── Hero console ────────────────────────────────────────────────── */
function HeroConsole() {
  return (
    <TiltCard max={4} className="relative">
      <div className="td-holo rounded-hero p-4 sm:p-5" data-spotlight>
        <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-danger/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
          </div>
          <span className="font-mono text-mono-micro font-bold uppercase tracking-[0.16em] text-text-3">trace / live</span>
        </div>
        <LiveTraceChart />
        <div className="mt-4 space-y-3 font-mono text-mono-caption leading-5">
          <p className="flex items-center justify-between gap-3 text-text-3"><span>POST /api/integrations/github/simulate</span><span className="text-accent-ink">401</span></p>
          <div className="rounded-ctl border border-diagline bg-diagnostic/90 p-3 text-diag2 shadow-e1">
            <p className="text-diag1">→ evidence sealed</p>
            <p>www-authenticate: bad credentials</p>
            <p>request_id: req_9f4c…81ad</p>
          </div>
          <p className="flex items-center justify-between gap-3 text-text-3"><span>incident</span><span className="text-warning-ink">#248 opened</span></p>
          <p className="flex items-center justify-between gap-3 text-text-3"><span>diagnosis</span><span className="text-success-ink">credential rejection · 0.98</span></p>
          <div className="relative h-px overflow-hidden rounded-pill bg-line">
            <span className="absolute inset-y-0 left-0 w-1/4 animate-[td-beam_2.4s_cubic-bezier(0.4,0,0.2,1)_infinite] bg-gradient-to-r from-transparent via-accent to-transparent" />
          </div>
        </div>
      </div>
    </TiltCard>
  );
}

/* ── The TraceDesk signature: a live left→right signal rail ────────
   A pulse travels Request → Telemetry → Incident → Evidence →
   Diagnosis on a continuous loop. Every stage lights as the pulse
   reaches it; connectors fill behind the packet. CSS-only motion. */
function SignaturePipeline() {
  const { ref, on } = useOnScreen<HTMLDivElement>('120px 0px');
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (!on) return;
    const timer = setInterval(() => setStage((s) => (s + 1) % SIGNATURE_STAGES.length), 1600);
    return () => clearInterval(timer);
  }, [on]);

  return (
    <Reveal>
      <div ref={ref} className="td-card overflow-hidden" data-spotlight>
        <div className="flex flex-wrap items-end justify-between gap-3 p-5 pb-0 sm:p-7 sm:pb-0">
          <div>
            <p className="td-label">The TraceDesk signature</p>
            <h2 className="mt-2 text-title font-semibold tracking-[-0.02em] text-text-1">
              <SplitText text="One request becomes a courtroom exhibit." mode="words" stagger={42} />
            </h2>
          </div>
          <span className="inline-flex items-center gap-2 rounded-pill border border-success/25 bg-success/[0.07] px-3 py-1 font-mono text-mono-micro font-bold uppercase tracking-[0.14em] text-success-ink">
            <span className="td-dot" aria-hidden="true" />
            live signal · {String(stage + 1).padStart(2, '0')}/{SIGNATURE_STAGES.length}
          </span>
        </div>

        {/* Desktop: perspective rail with a packet sweeping left → right */}
        <div className="relative hidden px-7 pb-2 pt-8 lg:block" aria-hidden="true">
          {/* perspective floor */}
          <div className="pointer-events-none absolute inset-x-10 bottom-3 h-40 [perspective:900px]">
            <div
              className="h-full w-full rounded-panel border border-accent/10 opacity-60 [transform:rotateX(64deg)] [transform-origin:bottom]"
              style={{
                backgroundImage:
                  'linear-gradient(to right, rgb(var(--td-accent) / 0.09) 1px, transparent 1px), linear-gradient(to bottom, rgb(var(--td-accent) / 0.09) 1px, transparent 1px)',
                backgroundSize: '34px 34px',
              }}
            />
          </div>

          <div className="relative [perspective:1200px]" style={{ transform: 'rotateX(6deg)' }}>
            <div className="flex items-center" style={{ transformStyle: 'preserve-3d' }}>
              {SIGNATURE_STAGES.map((node, i) => {
                const lit = i <= stage;
                const isCurrent = i === stage;
                const Icon = node.icon;
                return (
                  <div key={node.label} className={`flex min-w-0 items-center ${i < SIGNATURE_STAGES.length - 1 ? 'flex-1' : ''}`}>
                    <div className={`relative flex w-[128px] shrink-0 flex-col items-center rounded-panel border p-3 text-center backdrop-blur-md transition-all duration-500 ease-fluid ${
                      isCurrent
                        ? `td-live-node ${node.chip} -translate-y-1.5 shadow-e3`
                        : lit
                          ? `${node.chip} shadow-e2`
                          : 'border-line bg-surface/70 opacity-55 shadow-e1'
                    }`}
                      style={{ animationDelay: isCurrent ? '0s' : undefined } as CSSProperties}
                    >
                      {isCurrent && (
                        <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-pill bg-accent px-2 py-px font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#010208] shadow-[0_0_18px_rgb(var(--td-accent)/0.8)]">
                          now
                        </span>
                      )}
                      <span className={`flex h-9 w-9 items-center justify-center rounded-ctl border bg-surface/80 ${lit ? node.tone : 'text-text-3'} transition-colors duration-500`}>
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <p className={`mt-2 font-mono text-mono-micro font-bold uppercase tracking-[0.12em] ${lit ? 'text-text-1' : 'text-text-3'} transition-colors duration-500`}>
                        {String(i + 1).padStart(2, '0')} · {node.label}
                      </p>
                      <p className="mt-0.5 text-caption leading-4 text-text-3">{node.detail}</p>
                    </div>
                    {i < SIGNATURE_STAGES.length - 1 && (
                      <span className="relative mx-1 h-[2px] min-w-4 flex-1 overflow-hidden rounded-pill bg-line">
                        <span
                          className={`absolute inset-y-0 left-0 w-full origin-left rounded-pill bg-gradient-to-r from-accent via-accent2 to-accent3 transition-transform duration-700 ease-fluid ${
                            i < stage ? 'scale-x-100' : 'scale-x-0'
                          }`}
                        />
                        {on && (
                          <span
                            className="absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_12px_rgb(var(--td-accent)/0.95)]"
                            style={{ animation: `td-packet-x 8s cubic-bezier(0.45,0,0.55,1) ${i * 1.6}s infinite` }}
                          />
                        )}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Mobile: vertical rail with the same sequencing */}
        <ol className="relative mx-5 mt-6 space-y-2 border-l border-line pb-1 pl-5 lg:hidden">
          <span
            aria-hidden="true"
            className="absolute -left-px top-0 w-px bg-gradient-to-b from-accent via-accent2 to-accent3 transition-all duration-700 ease-fluid"
            style={{ height: `${((stage + 1) / SIGNATURE_STAGES.length) * 100}%` }}
          />
          {SIGNATURE_STAGES.map((node, i) => {
            const lit = i <= stage;
            const Icon = node.icon;
            return (
              <li key={node.label} className="relative">
                <span
                  className={`absolute -left-[27px] top-3 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 transition-all duration-500 ${
                    lit ? 'border-accent bg-accent shadow-[0_0_14px_rgb(var(--td-accent)/0.8)]' : 'border-line bg-surface'
                  }`}
                  aria-hidden="true"
                />
                <div className={`rounded-ctl border p-3 transition-all duration-500 ${i === stage ? node.chip : 'border-line bg-surface/60'}`}>
                  <p className="flex items-center gap-2">
                    <Icon className={`h-3.5 w-3.5 ${lit ? node.tone : 'text-text-3'}`} aria-hidden="true" />
                    <span className="font-mono text-mono-micro font-bold uppercase tracking-[0.12em] text-text-1">
                      {String(i + 1).padStart(2, '0')} · {node.label}
                    </span>
                  </p>
                  <p className="mt-1 pl-6 text-caption leading-4 text-text-3">{node.detail}</p>
                </div>
              </li>
            );
          })}
        </ol>

        <p className="max-w-3xl px-5 pb-6 pt-5 text-subhead leading-6 text-text-3 sm:px-7 sm:pb-7">
          The TraceDesk signature: every request becomes telemetry, every failure becomes an incident with
          evidence, every evidence set becomes a diagnosis - and every diagnosis can be defended later.
        </p>
      </div>
    </Reveal>
  );
}

/* ── Core workflow: 3D stepping-stone signal path ──────────────────
   Six stations on a tilted plane. A signal sweeps the loop on its own:
   stations light as the wave reaches them, beams fill behind it, and
   cards sit at alternating depths (translateZ). */
const WORKFLOW_ICONS = [Radio, FlaskConical, Braces, ScanLine, CheckCircle2, BookOpen];

function WorkflowPath() {
  const { ref, on } = useOnScreen<HTMLDivElement>('120px 0px');
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!on) return;
    const timer = setInterval(() => setActive((a) => (a + 1) % WORKFLOW.length), 1400);
    return () => clearInterval(timer);
  }, [on]);

  // Three dominant hues cycle across the stations: sapphire, cyan, violet.
  const WF_TONES = [
    { ink: 'text-accent-ink', tile: 'border-accent/35 bg-accent/[0.1]', bar: 'bg-gradient-to-b from-accent to-accent3' },
    { ink: 'text-accent3-ink', tile: 'border-accent3/35 bg-accent3/[0.1]', bar: 'bg-gradient-to-b from-accent3 to-accent2' },
    { ink: 'text-accent2-ink', tile: 'border-accent2/35 bg-accent2/[0.1]', bar: 'bg-gradient-to-b from-accent2 to-accent' },
  ] as const;

  const stationCard = (step: (typeof WORKFLOW)[number], i: number, tilted: boolean) => {
    const Icon = WORKFLOW_ICONS[i] ?? Radio;
    const tone = WF_TONES[i % WF_TONES.length];
    const lit = i <= active;
    const current = i === active;
    return (
      <div
        className={`group relative min-w-0 overflow-hidden rounded-panel border p-5 transition-all duration-500 ease-fluid ${
          tilted ? '[transform:translateZ(var(--tz))] [transform-style:preserve-3d]' : ''
        } ${
          current
            ? 'td-live-node border-accent/55 bg-accent/[0.05] shadow-e3'
            : lit
              ? 'border-line-strong bg-surface/90 shadow-e2'
              : 'border-line bg-surface/80 opacity-65 shadow-e1'
        }`}
        style={tilted ? { ['--tz' as string]: `${current ? 54 : i % 2 === 0 ? 26 : 8}px` } : undefined}
        data-spotlight
      >
        {/* station spine: per-hue gradient rail on the left edge */}
        <span className={`absolute inset-y-0 left-0 w-[3px] ${tone.bar} opacity-80`} aria-hidden="true" />
        {/* beam sweeps the top edge while this station is active */}
        {current && on && (
          <span className="pointer-events-none absolute inset-x-0 top-0 h-px overflow-hidden" aria-hidden="true">
            <span className="absolute inset-y-0 left-0 w-1/4 animate-[td-beam_2.2s_cubic-bezier(0.4,0,0.2,1)_infinite] bg-gradient-to-r from-transparent via-accent to-transparent" />
          </span>
        )}
        {current && (
          <span className="absolute -top-2.5 right-4 rounded-pill bg-accent px-2 py-px font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#04070F] shadow-[0_0_18px_rgb(var(--td-accent)/0.8)]">
            now
          </span>
        )}
        <div className="flex items-start justify-between gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-ctl border transition-all duration-500 ease-fluid ${tone.tile} ${
              current ? `scale-110 ${tone.ink} shadow-[0_0_20px_-6px_rgb(var(--td-accent)/0.7)]` : lit ? tone.ink : 'border-line bg-inset text-text-3'
            }`}
            aria-hidden="true"
          >
            <Icon className="h-[18px] w-[18px]" />
          </span>
          <span
            className={`select-none font-mono text-[2.6rem] font-bold leading-[0.85] tracking-[-0.07em] transition-colors duration-500 ${
              current ? `${tone.ink} opacity-70` : 'text-text-1/[0.09]'
            }`}
            aria-hidden="true"
          >
            {String(i + 1).padStart(2, '0')}
          </span>
        </div>
        <p className={`mt-3.5 text-subhead font-semibold tracking-[-0.01em] transition-colors duration-500 ${lit ? 'text-text-1' : 'text-text-2'}`}>
          {step.step}
        </p>
        <p className="mt-1.5 text-caption leading-5 text-text-2">{step.text}</p>
      </div>
    );
  };

  return (
    <Reveal>
      <div ref={ref} className="td-card overflow-hidden" data-spotlight>
        <div className="flex flex-wrap items-end justify-between gap-3 p-5 pb-0 sm:p-7 sm:pb-0">
          <div>
            <p className="td-label">Six stations · one loop</p>
            <h2 className="mt-2 text-title font-semibold tracking-[-0.02em] text-text-1">
              <SplitText text="From first alert to institutional memory." mode="words" stagger={34} />
            </h2>
          </div>
          <span className="inline-flex items-center gap-2 rounded-pill border border-success/25 bg-success/[0.07] px-3 py-1 font-mono text-mono-micro font-bold uppercase tracking-[0.14em] text-success-ink">
            <span className="td-dot" aria-hidden="true" />
            live signal · {String(active + 1).padStart(2, '0')}/{WORKFLOW.length}
          </span>
        </div>

        {/* Desktop: relay deck - a 3x2 station grid tilted in 3D, with a
            blueprint floor and a wave that lights stations in sequence. */}
        <div className="relative hidden px-7 pb-10 pt-9 lg:block" style={{ perspective: '1500px' }}>
          {/* corner glows */}
          <span className="pointer-events-none absolute -left-8 top-6 h-44 w-44 rounded-full bg-accent/[0.1] blur-3xl" aria-hidden="true" />
          <span className="pointer-events-none absolute -right-8 bottom-4 h-44 w-44 rounded-full bg-accent2/[0.1] blur-3xl" aria-hidden="true" />
          {/* floor */}
          <div className="pointer-events-none absolute inset-x-10 bottom-4 h-36 [perspective:900px]" aria-hidden="true">
            <div
              className="h-full w-full rounded-panel border border-accent/10 opacity-50 [transform:rotateX(66deg)] [transform-origin:bottom]"
              style={{
                backgroundImage:
                  'linear-gradient(to right, rgb(var(--td-accent) / 0.08) 1px, transparent 1px), linear-gradient(to bottom, rgb(var(--td-accent) / 0.08) 1px, transparent 1px)',
                backgroundSize: '34px 34px',
              }}
            />
          </div>

          <div className="relative grid gap-4 transition-transform duration-1000 ease-fluid [transform:rotateX(12deg)] [transform-style:preserve-3d] sm:grid-cols-2 lg:grid-cols-3">
            {WORKFLOW.map((step, i) => stationCard(step, i, true))}
          </div>
        </div>

        {/* Tablet/mobile: flat relay grid, same wave */}
        <div className="grid gap-4 p-5 pt-6 sm:grid-cols-2 sm:p-7 sm:pt-7 lg:hidden">
          {WORKFLOW.map((step, i) => stationCard(step, i, false))}
        </div>
      </div>
    </Reveal>
  );
}

/* ── Architecture: three planes with packets flowing left → right ── */
function ArchitecturePlane() {
  const { ref, on } = useOnScreen<HTMLDivElement>('120px 0px');
  // Sequence wave: plane 01 -> 02 -> 03, then the SSE rail pulses back.
  const [activeTier, setActiveTier] = useState(0);

  useEffect(() => {
    if (!on) return;
    const timer = setInterval(() => setActiveTier((t) => (t + 1) % ARCH_TIERS.length), 1700);
    return () => clearInterval(timer);
  }, [on]);

  return (
    <Reveal>
      <div ref={ref} className="td-card overflow-hidden p-5 sm:p-7" data-spotlight>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="td-label">Architecture · as built</p>
            <h2 className="mt-2 text-title font-semibold tracking-[-0.02em] text-text-1">
              <SplitText text="Three planes. One traceable request path." mode="words" stagger={36} />
            </h2>
          </div>
          <span className="inline-flex items-center gap-2 rounded-pill border border-line bg-inset/70 px-3 py-1 font-mono text-mono-micro font-bold uppercase tracking-[0.14em] text-text-2">
            <CircuitBoard className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            holographic deck · live trace
          </span>
        </div>

        {/* Desktop: holographic table - three planes standing on a tilted
            glass deck. Each plane floats at a greater depth (translateZ),
            packets ride the beams between them, and a sequence wave lights
            the planes in order while hovering the table levels it. */}
        <div className="relative hidden lg:block" aria-hidden="false">
          <div className="relative z-10 px-2 pt-12" style={{ perspective: '1600px' }}>
            {/* corner glows */}
            <span className="pointer-events-none absolute -left-10 -top-10 h-52 w-52 rounded-full bg-accent/[0.12] blur-3xl" aria-hidden="true" />
            <span className="pointer-events-none absolute -bottom-12 right-0 h-52 w-52 rounded-full bg-accent3/[0.1] blur-3xl" aria-hidden="true" />

            {/* rotating glass deck */}
            <div
              className="relative transition-transform duration-1000 ease-fluid [transform:rotateX(20deg)] [transform-style:preserve-3d] hover:[transform:rotateX(8deg)]"
            >
              {/* deck grid + rotating scan ring */}
              <div className="pointer-events-none absolute -inset-x-6 -bottom-16 top-1/2 [transform-style:preserve-3d]" aria-hidden="true">
                <div
                  className={`absolute inset-x-0 bottom-0 h-56 [perspective:800px] ${on ? 'animate-[td-grid-pan_6s_linear_infinite]' : ''}`}
                >
                  <div
                    className="h-full w-full rounded-panel border border-accent/10 opacity-60 [transform:rotateX(72deg)] [transform-origin:bottom]"
                    style={{
                      backgroundImage:
                        'linear-gradient(to right, rgb(var(--td-accent) / 0.1) 1px, transparent 1px), linear-gradient(to bottom, rgb(var(--td-accent) / 0.1) 1px, transparent 1px)',
                      backgroundSize: '34px 34px',
                    }}
                  />
                </div>
                <span
                  className={`absolute bottom-2 left-1/2 h-[430px] w-[430px] -translate-x-1/2 rounded-full border border-dashed border-accent2/25 [transform:translate(-50%,0)_rotateX(72deg)] ${on ? 'animate-[td-orbit_30s_linear_infinite]' : ''}`}
                />
              </div>

              <div className="relative flex items-stretch [transform-style:preserve-3d]">
                {ARCH_TIERS.map((tier, t) => {
                  const tierActive = activeTier === t;
                  const tierLit = activeTier >= t;
                  return (
                  <div key={tier.id} className={`flex min-w-0 flex-col [transform-style:preserve-3d] ${t < ARCH_TIERS.length - 1 ? 'flex-1' : ''}`}>
                    <div className="mb-3 flex items-center gap-2" style={{ transform: `translateZ(${t * 70}px)` }}>
                      <span
                        className={`rounded-pill border px-2.5 py-1 font-mono text-mono-micro font-bold uppercase tracking-[0.16em] transition-all duration-500 ease-fluid ${
                          tierActive
                            ? 'td-live-node border-accent/55 bg-accent text-[#04070F] shadow-[0_0_22px_rgb(var(--td-accent)/0.7)]'
                            : tierLit
                              ? 'border-accent/40 bg-accent/[0.12] text-accent-ink shadow-e1'
                              : 'border-line bg-inset/70 text-text-3'
                        }`}
                      >
                        {tier.tag}
                      </span>
                      <span
                        className={`text-caption font-bold uppercase tracking-[0.14em] transition-colors duration-500 ${
                          tierActive ? 'text-text-1' : tierLit ? 'text-text-2' : 'text-text-3'
                        }`}
                      >
                        {tier.name}
                      </span>
                    </div>
                    <div className="flex flex-1 items-stretch" style={{ transform: `translateZ(${t * 70}px)` }}>
                      <div className={`flex w-full flex-col gap-3 transition-opacity duration-500 ${tierLit ? 'opacity-100' : 'opacity-55'}`}>
                        {tier.nodes.map((node) => {
                          const Icon = node.icon;
                          return (
                            <div
                              key={node.label}
                              className={`td-card td-card-hover group/node flex items-center gap-3 p-3.5 transition-all duration-500 ease-fluid ${
                                tierActive
                                  ? 'td-live-node border-accent/45 shadow-e3'
                                  : tierLit
                                    ? 'border-line-strong shadow-e2'
                                    : ''
                              }`}
                            >
                              <span
                                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-ctl border transition-all duration-500 ease-fluid group-hover/node:scale-110 ${
                                  tierActive
                                    ? 'border-accent/45 bg-accent/[0.14] text-accent-ink shadow-[0_0_16px_-4px_rgb(var(--td-accent)/0.7)]'
                                    : tierLit
                                      ? 'border-accent/25 bg-accent/[0.07] text-accent-ink'
                                      : 'border-line bg-inset text-text-3'
                                }`}
                              >
                                <Icon className="h-4 w-4" aria-hidden="true" />
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate font-mono text-mono-caption font-semibold text-text-1">{node.label}</span>
                                <span className="block truncate text-micro font-medium text-text-3">{node.detail}</span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      {t < ARCH_TIERS.length - 1 && (
                        <span className="relative mx-1 w-8 shrink-0 self-center sm:mx-2">
                          <span className="absolute inset-x-0 bottom-6 top-6 rounded-pill border-t-2 border-dashed border-accent/30" />
                          <span className="absolute inset-x-0 bottom-6 top-6 overflow-hidden" aria-hidden="true">
                            <span
                              className="absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_12px_rgb(var(--td-accent)/0.95)]"
                              style={on ? { animation: 'td-packet-x 4.8s cubic-bezier(0.45,0,0.55,1) infinite' } : { display: 'none' }}
                            />
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* SSE return rail: packets stream right → left */}
          <div className="relative mt-8 h-10" aria-hidden="true">
            <div className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 overflow-hidden rounded-pill bg-line">
              <span className="absolute inset-0 bg-gradient-to-l from-accent3/50 via-accent3/20 to-transparent" />
              {on && (
                <>
                  <span className="absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-accent3 shadow-[0_0_12px_rgb(var(--td-accent-3)/0.95)]" style={{ animation: 'td-packet-x 5.5s linear infinite reverse' }} />
                  <span className="absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-accent3 shadow-[0_0_12px_rgb(var(--td-accent-3)/0.95)]" style={{ animation: 'td-packet-x 5.5s linear 1.8s infinite reverse' }} />
                  <span className="absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-accent3 shadow-[0_0_12px_rgb(var(--td-accent-3)/0.95)]" style={{ animation: 'td-packet-x 5.5s linear 3.6s infinite reverse' }} />
                </>
              )}
            </div>
            <span className="absolute -top-4 right-0 rounded-pill border border-accent3/30 bg-accent3/[0.08] px-2.5 py-0.5 font-mono text-mono-micro font-bold uppercase tracking-[0.12em] text-accent3-ink">
              SSE · /api/events
            </span>
            <span className="absolute -top-4 left-0 font-mono text-mono-micro font-bold uppercase tracking-[0.12em] text-accent3-ink/80">
              events → every open browser
            </span>
          </div>
        </div>

        {/* Mobile: stacked planes */}
        <div className="space-y-4 lg:hidden">
          {ARCH_TIERS.map((tier) => (
            <div key={tier.id} className="td-inset p-4">
              <p className="flex items-center gap-2">
                <span className="rounded-pill border border-accent/25 bg-accent/[0.07] px-2 py-0.5 font-mono text-mono-micro font-bold uppercase tracking-[0.14em] text-accent-ink">{tier.tag}</span>
                <span className="text-caption font-bold uppercase tracking-[0.12em] text-text-2">{tier.name}</span>
              </p>
              <div className="mt-3 space-y-2">
                {tier.nodes.map((node) => {
                  const Icon = node.icon;
                  return (
                    <div key={node.label} className="flex items-center gap-3 rounded-ctl border border-line bg-surface/80 p-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-ctl border border-accent/25 bg-accent/[0.07] text-accent-ink">
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-mono text-mono-caption font-semibold text-text-1">{node.label}</span>
                        <span className="block truncate text-micro text-text-3">{node.detail}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="rounded-ctl border border-accent3/25 bg-accent3/[0.06] px-3.5 py-2.5 font-mono text-mono-micro font-bold uppercase tracking-[0.12em] text-accent3-ink">
            SSE · /api/events → realtime return path
          </p>
        </div>

        <p className="mt-5 text-caption leading-5 text-text-3">
          The dashed channels are the wire format: requests flow left to right through the control plane into
          PostgreSQL and the connector fleet; every resulting domain event streams back over Server-Sent Events.
        </p>
      </div>
    </Reveal>
  );
}

/* Donut segment for one dependency group. Segments draw in when `on`. */
function DonutSegments({ on }: { on: boolean }) {
  const R = 54;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <g transform="rotate(-90 70 70)">
      {DEP_GROUPS.map((g) => {
        const frac = g.count / DEP_TOTAL;
        const len = frac * C;
        const dash = `${on ? Math.max(len - 2.5, 0) : 0} ${C - Math.max(len - 2.5, 0)}`;
        const el = (
          <circle
            key={g.id}
            cx="70" cy="70" r={R}
            fill="none"
            stroke={g.color}
            strokeWidth="17"
            strokeDasharray={dash}
            strokeDashoffset={-offset}
            strokeLinecap="butt"
            style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(0.22,1,0.36,1)' }}
          />
        );
        offset += len;
        return el;
      })}
    </g>
  );
}

function StackExchange() {
  const { ref, on } = useOnScreen<HTMLDivElement>('100px 0px');
  // Flat list of every real package for the ticker, colored by group.
  const roll = DEP_GROUPS.flatMap((g) => g.pkgs.map((p) => ({ name: p, color: g.color, group: g.id })));

  return (
    <Reveal>
      <div ref={ref} className="overflow-hidden rounded-panel border border-line bg-surface/85 shadow-e2" data-spotlight>
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-inset/50 px-5 py-3">
          <p className="flex items-center gap-2 font-mono text-mono-caption font-bold uppercase tracking-[0.16em] text-text-1">
            <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            TD:STACK · real dependency composition
          </p>
          <p className="flex items-center gap-2 font-mono text-mono-micro font-bold uppercase tracking-[0.14em] text-text-2">
            <span className="td-dot" aria-hidden="true" />
            {DEP_TOTAL} direct deps · counted from package.json
          </p>
        </div>

        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-center">
          {/* Donut: real counts, four hues, draws in on reveal */}
          <div className="mx-auto w-[220px]">
            <svg viewBox="0 0 140 140" className="h-[220px] w-[220px]" role="img" aria-label="Dependency composition donut chart">
              <circle cx="70" cy="70" r="54" fill="none" stroke="rgb(var(--td-line))" strokeWidth="17" opacity="0.5" />
              <DonutSegments on={on} />
              <text x="70" y="66" textAnchor="middle" className="fill-[rgb(var(--td-text-1))]" style={{ font: '700 26px "Geist Mono Variable", ui-monospace, monospace' }}>
                {DEP_TOTAL}
              </text>
              <text x="70" y="84" textAnchor="middle" className="fill-[rgb(var(--td-text-3))]" style={{ font: '700 8px "Geist Mono Variable", ui-monospace, monospace', letterSpacing: '0.14em' }}>
                DIRECT DEPS
              </text>
            </svg>
          </div>

          {/* Legend bars: count + real % per group */}
          <div className="min-w-0 space-y-3">
            {DEP_GROUPS.map((g, i) => (
              <div key={g.id} className="group">
                <div className="flex items-center justify-between gap-3">
                  <p className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-[4px]" style={{ background: g.color }} aria-hidden="true" />
                    <span className="truncate text-subhead font-semibold text-text-1">{g.name}</span>
                    <span className="hidden truncate text-caption text-text-3 sm:inline">· {g.note}</span>
                  </p>
                  <p className="shrink-0 font-mono text-mono-caption font-bold tabular-nums text-text-1">
                    {g.count} <span className="text-text-3">· {depPct(g.count)}%</span>
                  </p>
                </div>
                <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-pill bg-inset">
                  <span
                    className="block h-full rounded-pill transition-[width] duration-1000 ease-fluid"
                    style={{ width: on ? `${(g.count / DEP_TOTAL) * 100}%` : '0%', background: `linear-gradient(90deg, ${g.color}, ${g.color}99)`, transitionDelay: `${i * 120}ms` }}
                  />
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Real package roll: every name is an actual dependency */}
        <div className="td-marquee-host td-marquee-mask overflow-hidden border-t border-line py-2.5">
          <div className="td-marquee" style={{ ['--marquee-dur' as string]: '52s' }}>
            {[0, 1].map((copy) => (
              <div key={copy} className="flex shrink-0 items-center" aria-hidden={copy === 1}>
                {roll.map((p, i) => (
                  <span key={`${copy}-${p.name}-${i}`} className="flex items-center gap-2 border-r border-line/70 px-4">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} aria-hidden="true" />
                    <span className="font-mono text-mono-caption font-semibold tracking-[0.02em]" style={{ color: p.color }}>{p.name}</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Stacked strip driven by the same real numbers */}
        <div className="border-t border-line px-5 py-3" aria-hidden="true">
          <div className="flex h-2.5 w-full overflow-hidden rounded-pill bg-inset">
            {DEP_GROUPS.map((g, i) => (
              <span
                key={g.id}
                className="relative h-full overflow-hidden transition-[width] duration-1000 ease-fluid"
                style={{
                  width: on ? `${(g.count / DEP_TOTAL) * 100}%` : '0%',
                  background: `linear-gradient(180deg, ${g.color}, ${g.color}B3)`,
                  borderRight: i < DEP_GROUPS.length - 1 ? '1px solid rgb(var(--td-canvas))' : undefined,
                  transitionDelay: `${i * 120}ms`,
                }}
              >
                <span className="absolute inset-y-0 w-1/3 bg-white/40" style={{ animation: `td-sheen 6s linear ${i * 0.7}s infinite` }} />
              </span>
            ))}
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-text-3">
            <span>0</span>
            <span>share of {DEP_TOTAL} direct dependencies</span>
            <span>{DEP_TOTAL}</span>
          </div>
        </div>
      </div>
    </Reveal>
  );
}

/* ── FAQ accordion (constellation) ───────────────────────────────── */
function FaqAccordion({ group, index }: { group: FaqGroup; index: number }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div
      id={['data', 'deploy'].includes(group.id) ? group.id : `faq-${group.id}`}
      className="td-card break-inside-avoid scroll-mt-24 overflow-hidden"
      data-spotlight
    >
      <div className="relative border-b border-line bg-inset/45 px-5 py-4">
        <span className="pointer-events-none absolute -right-2 -top-5 font-mono text-[64px] font-bold leading-none tracking-[-0.08em] text-accent/10 dark:text-accent/15" aria-hidden="true">
          {String(index + 1).padStart(2, '0')}
        </span>
        <p className="td-label relative">{group.title}</p>
        <div className="relative mt-2 h-px w-full overflow-hidden bg-line">
          <span className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-accent to-transparent opacity-70" />
        </div>
      </div>
      {group.items.map((item, i) => {
        const key = `${group.id}-${i}`;
        const isOpen = open === key;
        return (
          <div key={key} className="border-b border-line last:border-b-0">
            <h3>
              <button
                onClick={() => setOpen(isOpen ? null : key)}
                aria-expanded={isOpen}
                aria-controls={`faq-panel-${key}`}
                id={`faq-button-${key}`}
                className="group flex w-full items-start justify-between gap-4 px-5 py-4 text-left transition-colors duration-150 ease-standard hover:bg-inset/60"
              >
                <span className="flex min-w-0 items-start gap-3">
                  <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-pill border transition-all duration-200 ${isOpen ? 'rotate-45 border-accent/40 bg-accent text-white dark:text-[#010208]' : 'border-line bg-surface text-text-3 group-hover:border-accent/35 group-hover:text-accent-ink'}`}>
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-subhead font-semibold tracking-[-0.01em] text-text-1">{item.q}</span>
                    <span className="mt-1 block font-mono text-mono-micro uppercase tracking-[0.12em] text-text-3">
                      {group.id}.{String(i + 1).padStart(2, '0')} · {isOpen ? 'open signal' : 'tap to unfold'}
                    </span>
                  </span>
                </span>
                <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-text-3 transition-transform duration-200 ease-standard ${isOpen ? 'rotate-180 text-accent' : ''}`} aria-hidden="true" />
              </button>
            </h3>
            <div id={`faq-panel-${key}`} role="region" aria-labelledby={`faq-button-${key}`} className="m-expand" data-open={isOpen}>
              <div>
                <div className="space-y-2.5 px-5 pb-5 pl-14">
                  {item.a.map((paragraph, p) => (
                    <p key={p} className="text-body leading-6 text-text-2">{paragraph}</p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────── */
export default function Help() {
  const [activeSection, setActiveSection] = useState<string>('pipeline');

  // Scroll-aware TOC via IntersectionObserver (no scroll listeners).
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        }
      },
      { rootMargin: '-35% 0px -55% 0px', threshold: 0 },
    );
    for (const { id } of TOC) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative grid gap-6 pb-10 pt-2 sm:pt-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.78fr)] xl:items-center">
        <div>
          <Reveal>
            <p className="inline-flex items-center gap-2 rounded-pill border border-accent/20 bg-accent/[0.06] px-3 py-1 text-micro font-bold uppercase tracking-[0.22em] text-accent-ink shadow-e1">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> TraceDesk · 2026 reliability workspace
            </p>
          </Reveal>
          <h1
            className="relative z-10 mt-4 font-semibold tracking-[-0.045em] text-text-1 xl:w-[128%] xl:max-w-[60rem]"
            style={{ fontSize: 'clamp(2.2rem, 4vw, 4rem)', lineHeight: 1.02 }}
          >
            <SplitText text="Every failure becomes evidence." mode="words" stagger={54} />
            <br />
            <SplitText text="Every evidence becomes an answer." mode="words" delay={180} stagger={48} className="text-gradient" />
          </h1>
          <Reveal delay={260}>
            <p className="mt-5 max-w-2xl text-body leading-7 text-text-2">
              TraceDesk turns integration outages into a disciplined loop: reproduce the failure,
              capture the proof, diagnose the cause, resolve with an audit trail, and document it so
              the next engineer is faster than you were.
            </p>
          </Reveal>
          <Reveal delay={360}>
            <div className="mt-6 flex flex-wrap items-center gap-2.5">
              <Link to="/lab" className="td-btn-primary m-press px-4 py-2.5">
                <FlaskConical className="h-4 w-4" aria-hidden="true" /> Open the Lab
              </Link>
              <Link to="/runbooks" className="td-btn-emerald m-press px-4 py-2.5">
                <BookOpen className="h-4 w-4" aria-hidden="true" /> View Runbooks
              </Link>
              <ResetDataButton label="Clear all logs" className="m-press" />
            </div>
          </Reveal>
          <Reveal delay={460}>
            <div className="mt-6 grid max-w-xl grid-cols-3 gap-2">
              {[
                ['10', 'connectors'],
                ['SSE', 'realtime'],
                ['0', 'config start'],
              ].map(([value, label], i) => (
                <div key={label} className="td-glass rounded-card px-3 py-2.5" style={{ transitionDelay: `${i * 40}ms` }}>
                  <p className="text-heading font-semibold tabular-nums text-text-1">{value}</p>
                  <p className="mt-0.5 text-micro font-bold uppercase tracking-[0.14em] text-text-3">{label}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
        <Reveal delay={220} className="xl:justify-self-end">
          <HeroConsole />
        </Reveal>
      </section>

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_190px]">
        <div className="min-w-0 space-y-14">
          {/* ── Signature pipeline (live, left → right) ──────── */}
          <section id="pipeline" className="scroll-mt-24">
            <SignaturePipeline />
          </section>

          {/* ── Product story - 3D editorial statement ───────── */}
          <section id="about" className="scroll-mt-24">
            <p className="td-label mb-4">Product story</p>
            <Reveal>
              <div className="relative overflow-hidden rounded-hero border border-line bg-surface/70 shadow-e2" data-spotlight>
                {/* dominant aurora: sapphire → violet → cyan */}
                <span className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-accent/[0.14] blur-3xl" aria-hidden="true" />
                <span className="pointer-events-none absolute -bottom-24 left-10 h-56 w-56 rounded-full bg-accent2/[0.12] blur-3xl" aria-hidden="true" />
                <span className="pointer-events-none absolute right-1/3 top-1/2 h-40 w-40 rounded-full bg-accent3/[0.08] blur-3xl" aria-hidden="true" />
                {/* ghost proof mark */}
                <span className="pointer-events-none absolute -bottom-10 right-6 select-none font-mono text-[180px] font-bold leading-none tracking-[-0.08em] text-text-1/[0.035]" aria-hidden="true">
                  ✓
                </span>

                <div className="relative p-6 sm:p-10">
                  <p className="max-w-4xl text-title font-medium leading-[1.35] tracking-[-0.02em] sm:text-[1.55rem]">
                    <SplitText text="Support engineering is not ticket closing. It is" mode="words" stagger={26} className="text-text-1" />{' '}
                    <SplitText text="proving what happened," mode="words" delay={520} stagger={40} className="text-gradient" />{' '}
                    <SplitText text="why it happened," mode="words" delay={760} stagger={40} className="text-gradient" />{' '}
                    <SplitText text="and that it will not happen the same way twice." mode="words" delay={1000} stagger={26} className="text-text-1" />
                  </p>

                  <div className="mt-9 grid gap-5 lg:grid-cols-2" style={{ perspective: '1200px' }}>
                    {[
                      {
                        id: '01',
                        tag: 'the reversal',
                        tone: 'text-accent-ink',
                        glow: 'bg-accent/[0.12]',
                        text: 'Most integration tooling shows you a red dashboard after the customer has already left. TraceDesk works the other way round: it reproduces the failure on demand, keeps the raw provider response as evidence, and forces every conclusion to cite that evidence. Diagnoses are deterministic rules, not vibes.',
                      },
                      {
                        id: '02',
                        tag: 'the loop',
                        tone: 'text-accent2-ink',
                        glow: 'bg-accent2/[0.12]',
                        text: 'When the fix lands, the incident compiles into a runbook: the exact document the next on-call engineer needs at 3am. That is the whole product - a loop from failure to institutional memory, sealed with an audit trail.',
                      },
                    ].map((stanza, i) => (
                      <Reveal key={stanza.id} delay={i * 140}>
                        <TiltCard max={6} className="h-full">
                          <div
                            className="group relative h-full overflow-hidden rounded-panel border border-line bg-surface/85 p-5 shadow-e2 transition-colors duration-300 hover:border-accent/30"
                            data-spotlight
                          >
                            <span className={`pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full ${stanza.glow} blur-2xl transition-opacity duration-500 group-hover:opacity-150`} aria-hidden="true" />
                            <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent opacity-40" aria-hidden="true" />
                            <p className="relative flex items-baseline gap-3">
                              <span className={`font-mono text-[2rem] font-bold leading-none tracking-[-0.06em] ${stanza.tone} opacity-90`}>{stanza.id}</span>
                              <span className="font-mono text-mono-micro font-bold uppercase tracking-[0.18em] text-text-3">{stanza.tag}</span>
                            </p>
                            <p className="relative mt-3.5 text-body leading-7 text-text-2">{stanza.text}</p>
                          </div>
                        </TiltCard>
                      </Reveal>
                    ))}
                  </div>
                </div>
              </div>
            </Reveal>
          </section>

          {/* ── Core workflow - 3D signal path ───────────────── */}
          <section id="incidents" className="scroll-mt-24">
            <p className="td-label mb-4">Core workflow</p>
            <WorkflowPath />
          </section>

          {/* ── Live vs simulated ────────────────────────────── */}
          <section id="connectors" className="scroll-mt-24">
            <p className="td-label mb-4">Live vs simulated</p>
            <div className="grid gap-4 md:grid-cols-2">
              <Reveal>
                <TiltCard max={3} className="h-full">
                  <div className="td-holo h-full rounded-panel p-5" data-spotlight>
                    <KindBadge kind="live" />
                    <p className="mt-3 text-heading font-semibold tracking-[-0.01em] text-text-1">Real providers, real responses</p>
                    <ul className="mt-3 space-y-2">
                      {[
                        'GitHub, Coinbase, httpbin.org and Open-Meteo over genuine HTTPS',
                        'Real 401 / 404 reproduction, incl. invalid-token and unauthenticated calls',
                        'Provider error bodies and headers stored verbatim as evidence',
                        'Custom Endpoint: call any URL you own and capture the truth',
                      ].map((line) => (
                        <li key={line} className="flex items-start gap-2 text-body leading-6 text-text-2">
                          <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-success-ink" strokeWidth={2.5} aria-hidden="true" />{line}
                        </li>
                      ))}
                    </ul>
                  </div>
                </TiltCard>
              </Reveal>
              <Reveal delay={90}>
                <TiltCard max={3} className="h-full">
                  <div className="h-full rounded-panel border border-line bg-surface/85 p-5 shadow-e1" data-spotlight>
                    <KindBadge kind="simulated" />
                    <p className="mt-3 text-heading font-semibold tracking-[-0.01em] text-text-1">Deterministic failure matrices</p>
                    <ul className="mt-3 space-y-2">
                      {[
                        'Slack, Jira, Stripe, SendGrid and Twilio demo connectors',
                        'Full 401 / 403 / 404 / 429 / 500 / timeout matrix on demand',
                        'In-process execution: identical evidence pipeline, zero network',
                        'Reproducible by design: the same scenario, the same result',
                      ].map((line) => (
                        <li key={line} className="flex items-start gap-2 text-body leading-6 text-text-2">
                          <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-text-3" strokeWidth={2.5} aria-hidden="true" />{line}
                        </li>
                      ))}
                    </ul>
                  </div>
                </TiltCard>
              </Reveal>
            </div>
          </section>

          {/* ── Architecture: three planes, live packets ─────── */}
          <section id="architecture" className="scroll-mt-24">
            <ArchitecturePlane />
          </section>

          {/* ── Tech stack: real composition ─────────────────── */}
          <section id="stack" className="scroll-mt-24">
            <p className="td-label mb-4">Tech stack · real numbers</p>
            <StackExchange />
          </section>

          {/* ── FAQ constellation ────────────────────────────── */}
          <section id="faq" className="scroll-mt-24">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="td-label">Frequently asked</p>
                <h2 className="mt-2 text-title font-semibold tracking-[-0.02em] text-text-1">
                  <SplitText text="Questions, arranged like a signal map." mode="words" stagger={34} />
                </h2>
              </div>
              <Link to="/lab?integration=custom-endpoint" className="group inline-flex items-center gap-1.5 text-caption font-semibold text-accent transition-colors hover:text-accent2-ink">
                Test your own endpoint <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </div>
            <div className="columns-1 gap-4 lg:columns-2 [column-fill:balance]">
              {FAQ_GROUPS.map((group, index) => (
                <div key={group.id} className="mb-4">
                  <FaqAccordion group={group} index={index} />
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* ── Scroll-aware TOC ───────────────────────────────── */}
        <aside className="hidden xl:block" aria-label="On this page">
          <div className="sticky top-24">
            <p className="td-label px-2">On this page</p>
            <nav className="mt-3 space-y-0.5 border-l border-line">
              {TOC.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => scrollToSection(entry.id)}
                  aria-current={activeSection === entry.id ? 'true' : undefined}
                  className={`-ml-px block w-full border-l-2 px-3 py-1.5 text-left text-caption transition-all duration-200 ease-standard ${
                    activeSection === entry.id
                      ? 'border-accent font-semibold text-text-1 shadow-[inset_12px_0_24px_-18px_rgb(var(--td-accent)/0.65)]'
                      : 'border-transparent text-text-2 hover:translate-x-0.5 hover:text-text-1'
                  }`}
                >
                  {entry.label}
                </button>
              ))}
            </nav>

            {/* credit, tucked into the right rail's empty space */}
            <div className="mt-10 border-t border-line px-2 pt-5">
              <p className="flex items-center gap-1.5 text-caption font-medium text-text-2">
                made with
                <svg viewBox="0 0 24 24" className="td-heart h-[14px] w-[14px]" role="img" aria-label="love">
                  <defs>
                    <linearGradient id="td-heart-grad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#FF5A6E" />
                      <stop offset="100%" stopColor="#C4081F" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"
                    fill="url(#td-heart-grad)"
                  />
                </svg>
                by <span className="font-semibold text-text-1">vav7</span>
              </p>
              <p className="mt-1.5 text-micro font-medium text-text-3">© tracedesk 2026 all rights reserved</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
