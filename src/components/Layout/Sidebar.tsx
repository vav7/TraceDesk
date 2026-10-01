import { useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Boxes, AlertTriangle, FlaskConical, BookOpen, CircleHelp } from 'lucide-react';
import { AppMark } from '../BrandLogo';
import { useEventStream } from '../../lib/EventStreamContext';
import { apiFetch } from '../../lib/api';

export const navItems = [
  { to: '/', label: 'Dashboard', icon: Home },
  { to: '/integrations', label: 'Integrations', icon: Boxes },
  { to: '/incidents', label: 'Incidents', icon: AlertTriangle },
  { to: '/lab', label: 'Troubleshooting Lab', icon: FlaskConical },
  { to: '/runbooks', label: 'Runbooks', icon: BookOpen },
  { to: '/help', label: 'Help & About', icon: CircleHelp },
];

const navGroups = [
  { label: 'Overview', items: navItems.slice(0, 1) },
  { label: 'Workspace', items: navItems.slice(1, 4) },
  { label: 'Knowledge', items: navItems.slice(4, 5) },
  { label: 'Support', items: navItems.slice(5) },
];

function isActive(pathname: string, to: string) {
  return pathname === to || (to !== '/' && pathname.startsWith(to));
}

/** Real backend database mode for the workspace footer chip. */
function useDbMode(): string | null {
  const [mode, setMode] = useState<string | null>(null);
  useEffectDbMode(setMode);
  return mode;
}
function useEffectDbMode(setMode: (m: string | null) => void) {
  useLayoutEffect(() => {
    let cancelled = false;
    apiFetch<{ database?: { mode?: string } }>('/health')
      .then((h) => { if (!cancelled) setMode(h.database?.mode === 'postgres' ? 'postgres' : 'mem-db'); })
      .catch(() => { if (!cancelled) setMode(null); });
    return () => { cancelled = true; };
  }, []);
}

function WorkspaceFooter() {
  const { status } = useEventStream();
  const dbMode = useDbMode();
  const live = status === 'live';

  return (
    <div className="border-t border-line px-4 py-3">
      <div className="td-glass rounded-ctl px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-small font-semibold text-text-1">Live Workspace</p>
          {dbMode && (
            <span className="shrink-0 rounded-pill border border-line bg-surface px-1.5 py-px font-mono text-mono-micro font-medium text-text-2">
              {dbMode}
            </span>
          )}
        </div>
        <p className="mt-1.5 flex items-center gap-2 text-caption font-medium text-text-2">
          <span className={`td-dot ${live ? '' : status === 'connecting' ? 'td-dot-amber' : 'td-dot-slate'}`} aria-hidden="true" />
          {live ? 'Realtime connected' : status === 'connecting' ? 'Realtime connecting…' : 'Realtime offline'}
        </p>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const location = useLocation();
  const navRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLAnchorElement>());
  const [slideY, setSlideY] = useState<number | null>(null);

  // One shared sliding indicator, positioned with transform only.
  useLayoutEffect(() => {
    const update = () => {
      const active = navItems.find((item) => isActive(location.pathname, item.to));
      const el = active ? itemRefs.current.get(active.to) : undefined;
      setSlideY(el ? el.offsetTop : null);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [location.pathname]);

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-surface/70 backdrop-blur-xl saturate-[1.08] md:flex">
      <span className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-accent/35 to-transparent" aria-hidden="true" />
      <div className="flex items-center gap-3 px-4 pb-5 pt-5">
        <AppMark size={36} />
        <div className="min-w-0">
          <p className="truncate text-heading font-semibold tracking-[-0.02em] text-text-1">TraceDesk</p>
          <p className="truncate text-[10px] font-bold uppercase tracking-[0.1em] text-text-3">Support Engineering</p>
        </div>
      </div>

      <div ref={navRef} className="relative flex-1 overflow-y-auto px-3 pb-4 pt-2">
        {slideY !== null && (
          <span
            aria-hidden="true"
            className="absolute left-3 right-3 top-0 h-9 rounded-ctl bg-[linear-gradient(90deg,rgb(var(--td-accent)/0.12),rgb(var(--td-accent-2)/0.10))] ring-1 ring-inset ring-accent/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_30px_-18px_rgb(var(--td-accent)/0.65)] transition-transform duration-300 ease-fluid dark:bg-[linear-gradient(90deg,rgb(var(--td-accent)/0.18),rgb(var(--td-accent-2)/0.14))] dark:ring-accent/25"
            style={{ transform: `translateY(${slideY}px)` }}
          />
        )}
        <div className="space-y-5">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="px-3 pb-1.5 text-micro font-bold uppercase tracking-[0.16em] text-text-3">{group.label}</p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(location.pathname, item.to);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      ref={(el) => {
                        if (el) itemRefs.current.set(item.to, el);
                        else itemRefs.current.delete(item.to);
                      }}
                      aria-current={active ? 'page' : undefined}
                      className={`relative z-10 flex h-9 items-center gap-3 rounded-ctl px-3 text-body transition-[color,transform] duration-200 ease-fluid hover:translate-x-1 ${
                        active
                          ? 'font-semibold text-text-1'
                          : 'font-medium text-text-2 hover:text-text-1'
                      }`}
                    >
                      <item.icon
                        className={`h-4 w-4 shrink-0 transition-colors duration-150 ${active ? 'text-accent' : 'text-text-3'}`}
                        strokeWidth={2}
                        aria-hidden="true"
                      />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <WorkspaceFooter />
    </aside>
  );
}

export function MobileNav() {
  const location = useLocation();
  return (
    <nav
      aria-label="Mobile navigation"
      className="sticky top-14 z-10 flex gap-2 overflow-x-auto border-b border-line bg-canvas/70 px-3 py-2 backdrop-blur-xl saturate-[1.08] [mask-image:linear-gradient(to_right,transparent,black_10px,black_calc(100%-10px),transparent)] md:hidden"
    >
      {navItems.map((item) => {
        const active = isActive(location.pathname, item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            aria-current={active ? 'page' : undefined}
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill border px-3 py-1.5 text-body font-medium transition-colors duration-150 ${
              active
                ? 'border-accent/25 bg-accent/[0.08] font-semibold text-accent-ink'
                : 'border-line bg-surface text-text-2'
            }`}
          >
            <item.icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
