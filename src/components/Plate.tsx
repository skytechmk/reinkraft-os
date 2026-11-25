import type { ReactNode } from 'react';

interface Props {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  flush?: boolean;
}

/** A squared panel with an optional title bar. */
export function Plate({ title, right, children, className = '', flush = false }: Props) {
  return (
    <section className={`mb-3 rounded-[3px] bg-plate shadow-[inset_0_0_0_1px_var(--color-rule)] ${className}`}>
      {title && (
        <header className="flex min-h-[44px] items-center justify-between gap-3 rounded-t-[3px] border-b border-rule bg-deck px-4">
          <h2 className="font-display text-lg font-extrabold tracking-wide text-bone">{title}</h2>
          {right}
        </header>
      )}
      <div className={flush ? '' : 'p-4'}>{children}</div>
    </section>
  );
}
