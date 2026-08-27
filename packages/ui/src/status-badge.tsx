import type { ReactNode } from 'react';

export function StatusBadge({ children }: Readonly<{ children: ReactNode }>) {
  return <span aria-label={`Status: ${String(children)}`}>{children}</span>;
}
