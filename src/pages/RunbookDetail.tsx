import { useEffect, useState } from 'react';
import { ArrowLeft, Download, FileText, CircleAlert, Activity, RotateCw, Search as SearchIcon, ShieldCheck, Wrench, LifeBuoy, Shield, Sparkles } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import MonoChip from '../components/ui/MonoChip';
import { timeAgo } from '../lib/time';
import { scrollToSection } from '../lib/scrollToSection';

interface Runbook {
  id: number;
  title: string;
  incident_title: string;
  problem: string;
  symptoms: string;
  likely_cause: string;
  verification: string;
  resolution: string;
  workaround: string;
  prevention: string;
  created_at: string;
  generated_by?: string;
}

const sections: Array<{ key: keyof Runbook; label: string; hint: string; describe: string; icon: typeof CircleAlert; chip: string }> = [
  {
    key: 'problem', label: 'Problem', icon: CircleAlert,
    hint: 'What broke, in one paragraph a stranger could act on.',
    describe: 'State the failure in plain language: what the customer experienced, which connector was involved, and when it started. Anyone reading this section should understand the blast radius without ever opening the raw incident.',
    chip: 'border-danger/25 bg-danger/[0.08] text-danger-ink',
  },
  {
    key: 'symptoms', label: 'Symptoms', icon: Activity,
    hint: 'The signals an on-call engineer actually observes first.',
    describe: 'List the observable signals - the exact status codes, error strings, latency spikes or webhook rejections that surfaced first. These are the clues the next on-call engineer will pattern-match against during the next outage.',
    chip: 'border-warning/25 bg-warning/[0.08] text-warning-ink',
  },
  {
    key: 'likely_cause', label: 'Likely Cause', icon: SearchIcon,
    hint: 'The failure mode this evidence pattern points to.',
    describe: 'Name the failure mode this evidence pattern points to, and say why: which header, which provider behavior, which retry signature. Deterministic reasoning here is what keeps the diagnosis repeatable instead of guesswork.',
    chip: 'border-caution/25 bg-caution/[0.08] text-caution-ink',
  },
  {
    key: 'verification', label: 'Verification', icon: ShieldCheck,
    hint: 'How to prove the cause before changing anything.',
    describe: 'Show how the cause was proven before anything was touched: the read-only calls, header checks or test requests that reproduced the signature. A fix without verification is only a guess with extra steps.',
    chip: 'border-accent/25 bg-accent/[0.08] text-accent',
  },
  {
    key: 'resolution', label: 'Resolution', icon: Wrench,
    hint: 'The fix that closed the incident, step by step.',
    describe: 'Record the exact steps that closed the incident, in order, including the config values, code changes or provider-side actions involved. This is the section the next engineer will copy verbatim at 3am.',
    chip: 'border-success/25 bg-success/[0.08] text-success-ink',
  },
  {
    key: 'workaround', label: 'Workaround', icon: LifeBuoy,
    hint: 'The interim mitigation while the permanent fix ships.',
    describe: 'Describe the interim mitigation that restored service while the permanent fix shipped, plus its limits: what it does not cover, what it degrades, and when it should be rolled back.',
    chip: 'border-accent2/25 bg-accent2/[0.08] text-accent2-ink',
  },
  {
    key: 'prevention', label: 'Prevention', icon: Shield,
    hint: 'Guards, alerts and tests that stop the recurrence.',
    describe: 'Capture the guard that stops the recurrence: the alert threshold, validation rule, automated test or dashboard link - anything that makes the same failure loud the moment it tries to happen again.',
    chip: 'border-accent/25 bg-accent/[0.07] text-accent',
  },
];

/**
 * The runbook as an engineering document: readable measure, numbered
 * anchorable sections, scroll-aware TOC. Content is shown in full; the
 * underlying runbook data is never rewritten.
 */
export default function RunbookDetail() {
  const { id } = useParams();
  const [runbook, setRunbook] = useState<Runbook | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>('problem');
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch<Runbook>(`/runbooks/${id}`)
      .then(setRunbook)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to fetch runbook'))
      .finally(() => setLoading(false));
  }, [id, reloadTick]);

  // Scroll-aware TOC: IntersectionObserver only, cleaned up on unmount.
  useEffect(() => {
    if (!runbook || typeof IntersectionObserver === 'undefined') return;
    const elements = sections
      .map(({ key }) => document.getElementById(`runbook-${key}`))
      .filter((el): el is HTMLElement => Boolean(el));
    if (elements.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveSection(entry.target.id.replace('runbook-', ''));
        }
      },
      { rootMargin: '-15% 0px -75% 0px', threshold: 0 },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [runbook]);

  if (loading) {
    // Skeleton mirrors the document layout: back link, title block, then
    // the full-height document column.
    return (
      <div role="status" aria-busy="true" className="space-y-4">
        <div className="td-skeleton h-4 w-36 rounded-pill" />
        <div className="space-y-3">
          <div className="td-skeleton h-7 w-full max-w-xl rounded-card" />
          <div className="td-skeleton h-4 w-64 rounded-card" />
        </div>
        <div className="td-skeleton h-[32rem]" />
        <p className="text-body text-text-2">Loading runbook…</p>
      </div>
    );
  }
  if (error) return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-card border border-danger/25 bg-danger/[0.05] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-body font-medium text-danger-ink">Error: {error}</p>
      <button onClick={() => setReloadTick((t) => t + 1)} className="td-btn-outline m-press px-3 py-1.5 text-caption">
        <RotateCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
      </button>
    </div>
  );
  if (!runbook) return <div className="text-body text-text-2">Runbook not found.</div>;

  const isAi = runbook.generated_by === 'ai';

  const downloadMarkdown = () => {
    const content = `# ${runbook.title}

**Incident:** ${runbook.incident_title}
**Created:** ${new Date(runbook.created_at).toLocaleString()}

## Problem
${runbook.problem}

## Symptoms
${runbook.symptoms}

## Likely Cause
${runbook.likely_cause}

## Verification
${runbook.verification}

## Resolution
${runbook.resolution}

## Workaround
${runbook.workaround}

## Prevention
${runbook.prevention}
`;
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `runbook-${runbook.id}.md`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div>
      <Link to="/runbooks" className="mb-5 inline-flex items-center gap-1.5 text-body font-medium text-text-2 transition-colors hover:text-accent">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to runbooks
      </Link>

      {/* Document header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <MonoChip tone="diagnostic" title={`Runbook ${runbook.id}`}>RBK-{runbook.id}</MonoChip>
            {isAi ? (
              <span className="inline-flex items-center gap-1 rounded-pill border border-accent2/25 bg-accent2/[0.07] px-2 py-[3px] text-caption font-semibold text-accent2-ink">
                <Sparkles className="h-3 w-3" aria-hidden="true" /> AI-drafted
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-pill border border-line bg-inset px-2 py-[3px] text-caption font-semibold text-text-2">
                <FileText className="h-3 w-3" aria-hidden="true" /> Manual
              </span>
            )}
            <span className="font-mono text-mono-micro tabular-nums text-text-3" title={new Date(runbook.created_at).toLocaleString()}>
              {timeAgo(runbook.created_at)}
            </span>
          </div>
          <h1 className="text-display font-semibold text-text-1">{runbook.title}</h1>
          <p className="mt-2 text-body text-text-2">
            Created from incident: <span className="font-medium text-text-1">{runbook.incident_title}</span>
          </p>
        </div>
        <button onClick={downloadMarkdown} className="td-btn-primary m-press shrink-0">
          <Download className="h-4 w-4" aria-hidden="true" /> Download Markdown
        </button>
      </div>

      {isAi && (
        <div className="mb-6 flex items-start gap-2.5 rounded-card border border-accent2/25 bg-accent2/[0.05] px-4 py-3 text-body leading-6 text-text-2">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent2" aria-hidden="true" />
          <p>AI-drafted from this incident's evidence, section by section, with deterministic fallbacks where the model output failed validation. Review before applying.</p>
        </div>
      )}

      <div className="grid gap-8 pb-24 lg:grid-cols-[minmax(0,1fr)_200px]">
        {/* Reading column */}
        <div className="max-w-3xl">
          {sections.map(({ key, label, hint, describe, icon: Icon, chip }, index) => (
            <section
              key={key}
              id={`runbook-${key}`}
              className={`scroll-mt-24 lg:min-h-[42vh] ${index > 0 ? 'mt-10 border-t border-line pt-8' : ''}`}
            >
              <div className="flex items-center gap-3.5">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-ctl border font-mono text-body font-bold tabular-nums ${chip}`}
                  aria-hidden="true"
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0">
                  <h2 className="flex items-center gap-2.5 text-title font-semibold tracking-[-0.015em] text-text-1">
                    <Icon className={`h-[18px] w-[18px] ${chip.split(' ').pop()}`} aria-hidden="true" />
                    {label}
                  </h2>
                  <p className="mt-0.5 text-caption leading-5 text-text-3">{hint}</p>
                </div>
              </div>
              <div className="mt-3.5 rounded-card border border-line bg-surface/60 p-4 shadow-e1">
                <p className="whitespace-pre-line text-body leading-7 text-text-2">
                  {String(runbook[key] ?? '-')}
                </p>
                <p className="mt-4 border-t border-dashed border-line pt-3.5 text-caption leading-6 text-text-3">
                  <span className={`font-mono font-bold uppercase tracking-[0.12em] ${chip.split(' ').pop()}`}>what belongs here · </span>
                  {describe}
                </p>
              </div>
            </section>
          ))}
        </div>

        {/* Sticky section navigation */}
        <aside className="hidden lg:block" aria-label="Runbook sections">
          <div className="sticky top-24">
            <p className="td-label px-3">On this page</p>
            <nav className="mt-3 border-l border-line">
              {sections.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => scrollToSection(`runbook-${key}`)}
                  aria-current={activeSection === key ? 'true' : undefined}
                  className={`-ml-px block w-full border-l-2 px-3 py-1.5 text-left text-caption transition-colors duration-150 ${
                    activeSection === key
                      ? 'border-accent font-semibold text-text-1'
                      : 'border-transparent text-text-2 hover:border-line-strong hover:text-text-1'
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>
        </aside>
      </div>
    </div>
  );
}
