import { ReactNode } from 'react';
import Reveal from '../motion/Reveal';
import SplitText from '../motion/SplitText';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}

export default function PageHeader({ eyebrow, title, description, action }: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <Reveal>
            <p className="mb-2.5 inline-flex items-center gap-2 rounded-pill border border-accent/15 bg-accent/[0.05] px-2.5 py-1 text-micro font-bold uppercase tracking-[0.18em] text-accent-ink shadow-e1">
              <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_14px_rgb(var(--td-accent)/0.75)]" aria-hidden="true" />
              {eyebrow}
            </p>
          </Reveal>
        )}
        <h1 className="text-display font-semibold tracking-[-0.035em] text-text-1">
          <SplitText text={title} mode="words" stagger={46} />
        </h1>
        {description && (
          <Reveal delay={120}>
            <p className="mt-2.5 max-w-2xl text-body leading-6 text-text-2">{description}</p>
          </Reveal>
        )}
      </div>
      {action && <Reveal delay={180} className="shrink-0">{action}</Reveal>}
    </div>
  );
}
