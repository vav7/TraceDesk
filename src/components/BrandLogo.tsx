import { siGithub, siJira, siStripe, siCoinbase } from 'simple-icons';
import { CloudSun, Globe, Mail, Boxes, Terminal, MessageCircle } from 'lucide-react';

/**
 * Real brand marks for the connector registry.
 * Slack/SendGrid are hand-inlined (removed from simple-icons over trademark
 * policy); the rest use the official simple-icons paths (CC0).
 * Rendered as premium "app tiles": brand-colored tile, white glyph
 * (GitHub inverts in dark mode; Slack shows its full-color pinwheel).
 *
 * NOTE: every glyph gets an explicit inline size - percentage classes on
 * SVGs collapse to the 300x150 default inside flex tiles.
 */

interface BrandLogoProps {
  slug: string;
  /** Tile size in pixels. */
  size?: number;
}

/** The TraceDesk application mark (activity glyph on the accent tile). */
export function AppMark({ size = 36 }: { size?: number }) {
  return (
    <span
      style={{ width: size, height: size }}
      className="relative flex shrink-0 items-center justify-center rounded-ctl shadow-[inset_0_1px_0_rgba(255,255,255,0.28),inset_0_-6px_12px_-6px_rgba(2,10,40,0.55),0_6px_18px_-8px_rgba(47,91,255,0.65),0_0_0_1px_rgba(47,91,255,0.4)]"
      aria-hidden="true"
    >
      {/* Fixed brand sapphire - identical in light and dark so the mark never dims */}
      <svg viewBox="0 0 36 36" width={size} height={size} className="absolute rounded-ctl">
        <defs>
          <linearGradient id="td-mark-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4A6BFF" />
            <stop offset="55%" stopColor="#2F5BFF" />
            <stop offset="100%" stopColor="#1E3EDB" />
          </linearGradient>
        </defs>
        <rect width="36" height="36" rx="10" fill="url(#td-mark-bg)" />
        <rect x="0" y="0" width="36" height="16" rx="10" fill="white" opacity="0.14" />
      </svg>
      <svg
        viewBox="0 0 24 24"
        width={Math.round(size * 0.55)}
        height={Math.round(size * 0.55)}
        fill="none"
        stroke="white"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="relative"
        style={{ filter: 'drop-shadow(0 1px 2px rgba(2,10,40,0.45))' }}
      >
        <path d="M22 12h-2.5l-2 6-4-14-2.5 8H2" />
      </svg>
    </span>
  );
}

function SlackPinwheel({ box }: { box: number }) {
  return (
    <svg viewBox="0 0 24 24" width={box} height={box} aria-hidden="true">
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 11.334 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#E01E5A" />
      <path d="M8.877 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.877 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.877zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.355z" fill="#36C5F0" />
      <path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 0 1-2.523 2.521 2.528 2.528 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.163 0a2.527 2.527 0 0 1 2.523 2.522v6.312z" fill="#2EB67D" />
      <path d="M15.163 18.956a2.528 2.528 0 0 1 2.523 2.522A2.527 2.527 0 0 1 15.163 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.27a2.528 2.528 0 0 1-2.52-2.523 2.527 2.527 0 0 1 2.52-2.52h6.315A2.527 2.527 0 0 1 24 15.163a2.528 2.528 0 0 1-2.522 2.523h-6.315z" fill="#ECB22E" />
    </svg>
  );
}

export default function BrandLogo({ slug, size = 40 }: BrandLogoProps) {
  const tile = { width: size, height: size };
  const glyph = Math.max(8, Math.round(size * 0.56));

  const shell = 'flex shrink-0 items-center justify-center rounded-ctl shadow-e1 ring-1 ring-inset';

  switch (slug) {
    case 'github':
      return (
        <span style={tile} className={`${shell} bg-[#181717] ring-white/10 dark:bg-white`} aria-hidden="true">
          <svg viewBox="0 0 24 24" width={glyph} height={glyph} className="fill-white dark:fill-[#181717]"><path d={siGithub.path} /></svg>
        </span>
      );
    case 'slack-demo':
      return (
        <span style={tile} className={`${shell} bg-white ring-black/5 dark:bg-[#1a1a1e] dark:ring-white/10`} aria-hidden="true">
          <SlackPinwheel box={Math.round(size * 0.66)} />
        </span>
      );
    case 'jira-demo':
      return (
        <span style={tile} className={`${shell} bg-[#0052CC] ring-white/10`} aria-hidden="true">
          <svg viewBox="0 0 24 24" width={glyph} height={glyph} className="fill-white"><path d={siJira.path} /></svg>
        </span>
      );
    case 'stripe-demo':
      return (
        <span style={tile} className={`${shell} bg-[#635BFF] ring-white/10`} aria-hidden="true">
          <svg viewBox="0 0 24 24" width={glyph} height={glyph} className="fill-white"><path d={siStripe.path} /></svg>
        </span>
      );
    case 'sendgrid-demo':
      return (
        <span style={tile} className={`${shell} bg-[#1A82E2] ring-white/10`} aria-hidden="true">
          <Mail width={glyph} height={glyph} strokeWidth={2.1} className="text-white" />
        </span>
      );
    case 'twilio-demo':
      return (
        <span style={tile} className={`${shell} bg-[#F22F46] ring-white/10`} aria-hidden="true">
          <MessageCircle width={glyph} height={glyph} strokeWidth={2.1} className="text-white" />
        </span>
      );
    case 'coinbase':
      return (
        <span style={tile} className={`${shell} bg-[#0052FF] ring-white/10`} aria-hidden="true">
          <svg viewBox="0 0 24 24" width={glyph} height={glyph} className="fill-white"><path d={siCoinbase.path} /></svg>
        </span>
      );
    case 'status-probe':
      return (
        <span style={tile} className={`${shell} bg-[#3B414A] ring-white/10`} aria-hidden="true">
          <Globe width={glyph} height={glyph} strokeWidth={2} className="text-white" />
        </span>
      );
    case 'open-meteo':
      return (
        <span style={tile} className={`${shell} bg-[#0EA5E9] ring-white/10`} aria-hidden="true">
          <CloudSun width={glyph} height={glyph} strokeWidth={2} className="text-white" />
        </span>
      );
    case 'custom-endpoint':
      return (
        <span style={tile} className={`${shell} bg-gradient-to-br from-zinc-800 to-zinc-950 ring-white/15 dark:from-zinc-200 dark:to-white`} aria-hidden="true">
          <Terminal width={glyph} height={glyph} strokeWidth={2.1} className="text-white dark:text-zinc-900" />
        </span>
      );
    default:
      return (
        <span style={tile} className={`${shell} bg-inset ring-line`} aria-hidden="true">
          <Boxes width={glyph} height={glyph} className="text-text-2" />
        </span>
      );
  }
}
