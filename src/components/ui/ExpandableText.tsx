import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface ExpandableTextProps {
  text: string;
  /** Visible lines when collapsed. */
  lines?: number;
  /** Render in monospace (evidence bodies, payloads). */
  mono?: boolean;
  className?: string;
}

/**
 * "Show more" for long copy: text clamps to N lines and a quiet toggle
 * expands it in place. Keeps dense layouts (cards, panels) free of walls.
 */
export default function ExpandableText({ text, lines = 3, mono = false, className = '' }: ExpandableTextProps) {
  const [open, setOpen] = useState(false);
  const [clamped, setClamped] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  const id = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Compare natural height vs clamped height to decide if a toggle is needed.
    setClamped(el.scrollHeight > el.clientHeight + 2);
  }, [text, lines, open]);

  const base = mono
    ? 'whitespace-pre-wrap break-words font-mono text-mono-body leading-5 text-text-2'
    : 'text-body leading-6 text-text-2';

  return (
    <div className={className}>
      <p
        ref={ref}
        id={`${id}-text`}
        className={`${base} overflow-hidden text-ellipsis [display:-webkit-box] [-webkit-box-orient:vertical]`}
        style={{ WebkitLineClamp: open ? undefined : lines }}
      >
        {text}
      </p>
      {(clamped || open) && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={`${id}-text`}
          className="mt-1 inline-flex items-center gap-1 text-caption font-semibold text-accent-ink transition-colors hover:text-accent2-ink"
        >
          {open ? 'Show less' : 'Show more'}
          <ChevronDown className={`h-3 w-3 transition-transform duration-200 ease-standard ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
