import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { ChevronRight, Moon, Sun } from 'lucide-react';
import { useTheme } from '../../lib/theme';
import { useEventStream } from '../../lib/EventStreamContext';
import AlertsBell from '../AlertsBell';
import { AppMark } from '../BrandLogo';
import MonoChip from '../ui/MonoChip';

export function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={toggleTheme}
      className={`relative flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-pill border transition-all duration-300 ease-fluid m-press ${
        isDark
          ? 'border-line-strong bg-inset shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)]'
          : 'border-line-strong bg-inset shadow-[inset_0_1px_3px_rgba(7,18,38,0.14)]'
      }`}
    >
      <span
        className={`absolute left-0.5 flex h-[22px] w-[22px] items-center justify-center rounded-full transition-all duration-300 ease-fluid ${
          isDark
            ? 'translate-x-[24px] bg-[#EDF1FA] text-[#0A1020] shadow-[0_2px_8px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.7)]'
            : 'translate-x-0 bg-[#131C33] text-[#F4F7FF] shadow-[0_2px_8px_rgba(7,18,38,0.35),inset_0_1px_0_rgba(255,255,255,0.25)]'
        }`}
      >
        {isDark ? (
          <Moon className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <Sun className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </span>
    </button>
  );
}

/** Typographic realtime indicator: pulses only while actually connected. */
function RealtimeIndicator() {
  const { status } = useEventStream();
  const live = status === 'live';
  const label = live ? 'Realtime connected' : status === 'connecting' ? 'Realtime connecting' : 'Realtime offline';

  return (
    <span className="hidden items-center gap-2 md:inline-flex" title={`SSE stream: ${status}`}>
      <span className={`td-dot ${live ? '' : status === 'connecting' ? 'td-dot-amber' : 'td-dot-slate'}`} aria-hidden="true" />
      <span className="text-micro font-bold uppercase tracking-[0.14em] text-text-2">
        {label}
      </span>
    </span>
  );
}

const sectionNames: Record<string, string> = {
  integrations: 'Integrations',
  incidents: 'Incidents',
  lab: 'Troubleshooting Lab',
  runbooks: 'Runbooks',
  help: 'Help & About',
};

export default function Header({ scrolled }: { scrolled: boolean }) {
  const location = useLocation();

  const crumbs = useMemo(() => {
    const segments = location.pathname.split('/').filter(Boolean);
    if (segments.length === 0) return [{ label: 'Dashboard' }];
    const base = sectionNames[segments[0]] || segments[0];
    return segments.length > 1
      ? [{ label: base }, { label: `#${segments[1]}`, mono: true }]
      : [{ label: base }];
  }, [location.pathname]);

  return (
    <header
      className={`sticky top-0 z-20 flex h-14 items-center justify-between gap-4 px-4 transition-[background-color,box-shadow,border-color] duration-300 ease-fluid sm:px-6 lg:px-8 ${
        scrolled
          ? 'border-b border-line bg-surface/70 shadow-e1 backdrop-blur-xl saturate-[1.08]'
          : 'border-b border-transparent bg-canvas/55 backdrop-blur-xl saturate-[1.08]'
      }`}
    >
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-accent/45 to-transparent opacity-70" aria-hidden="true" />
      {/* Mobile brand */}
      <div className="flex min-w-0 items-center gap-2.5 md:hidden">
        <AppMark size={28} />
        <p className="truncate text-heading font-semibold tracking-[-0.015em] text-text-1">TraceDesk</p>
      </div>

      {/* Desktop breadcrumb */}
      <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 md:flex">
        <span className="shrink-0 text-subhead font-medium text-text-3 transition-colors duration-150 hover:text-text-2">Workspace</span>
        {crumbs.map((crumb, index) => (
          <span key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
            <ChevronRight className="h-3 w-3 shrink-0 text-text-3/70" aria-hidden="true" />
            {index === crumbs.length - 1 ? (
              crumb.mono ? (
                <MonoChip>{crumb.label}</MonoChip>
              ) : (
                <span className="truncate text-subhead font-semibold text-text-1">{crumb.label}</span>
              )
            ) : (
              <span className="truncate text-subhead font-medium text-text-2">{crumb.label}</span>
            )}
          </span>
        ))}
      </nav>

      <div className="flex shrink-0 items-center gap-3 sm:gap-4">
        <RealtimeIndicator />
        <AlertsBell />
        <ThemeToggle />
        <span className="hidden h-5 w-px bg-line-strong/70 sm:block" aria-hidden="true" />
        <div className="hidden items-center gap-2.5 sm:flex">
          <div className="text-right">
            <p className="text-small font-semibold leading-tight text-text-1">Support Engineer</p>
            <p className="font-mono text-mono-micro leading-tight text-text-3">support@tracedesk.io</p>
          </div>
          <div
            aria-label="Support Engineer"
            className="flex h-8 w-8 items-center justify-center rounded-pill border border-line bg-inset text-caption font-semibold text-text-1"
          >
            SE
          </div>
        </div>
      </div>
    </header>
  );
}
