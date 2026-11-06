import type { ReactNode } from 'react';

export function Panel({
  title,
  desc,
  meta,
  children,
  className,
  flush = false,
  id,
  level = 2,
}: {
  title: string;
  /** The page's first card names the screen; every other card is a section. */
  level?: 1 | 2;
  /** One quiet line under the title: what the card shows, Beszel style. */
  desc?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  flush?: boolean;
  id?: string;
}) {
  return (
    <section className={`panel ${className ?? ''}`} aria-labelledby={id ?? undefined}>
      <header className="panel-head">
        <div className="panel-heading">
          {level === 1 ? (
            <h1 className="panel-title" id={id}>
              {title}
            </h1>
          ) : (
            <h2 className="panel-title" id={id}>
              {title}
            </h2>
          )}
          {desc ? <p className="panel-desc">{desc}</p> : null}
        </div>
        {meta ? <div className="panel-meta">{meta}</div> : null}
      </header>
      <div className={flush ? 'panel-body flush' : 'panel-body'}>{children}</div>
    </section>
  );
}

export function PageHeader({
  title,
  titleExtra,
  finding,
  actions,
  crumbs,
}: {
  title: ReactNode;
  titleExtra?: ReactNode;
  finding?: ReactNode;
  actions?: ReactNode;
  crumbs?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        {crumbs ? (
          <nav className="crumbs" aria-label="Breadcrumb">
            {crumbs}
          </nav>
        ) : null}
        <div className="title-line">
          <h1 className="page-title">{title}</h1>
          {titleExtra}
        </div>
        {finding ? <p className="page-finding">{finding}</p> : null}
      </div>
      {actions ? <div className="page-head-actions">{actions}</div> : null}
    </div>
  );
}
