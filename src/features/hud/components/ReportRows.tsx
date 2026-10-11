import type { ReactNode } from 'react';

export function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section>
      <h3 className="hud-report-heading">{title}</h3>
      {children}
    </section>
  );
}

export function Rows({ children }: { readonly children: ReactNode }) {
  return <dl className="hud-report-rows">{children}</dl>;
}

export function Row({
  label,
  total = false,
  children,
}: {
  readonly label: string;
  readonly total?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <div className="hud-report-row" data-total={total || undefined}>
      <dt className="ui-label">{label}</dt>
      {children}
    </div>
  );
}
