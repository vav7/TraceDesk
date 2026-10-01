import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  message: string;
}

export default function EmptyState({ message }: EmptyStateProps) {
  return (
    <div role="status" className="td-card flex flex-col items-center gap-3 border-dashed px-8 py-12 text-center shadow-none">
      <div className="td-icon-chip">
        <Inbox className="h-4 w-4" aria-hidden="true" />
      </div>
      <p className="max-w-sm text-body leading-6 text-text-2">{message}</p>
    </div>
  );
}
