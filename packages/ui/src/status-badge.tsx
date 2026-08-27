import type { ReactNode } from 'react';

export function StatusBadge({ children }: Readonly<{ children: ReactNode }>) {
  return <span>{children}</span>;
}
