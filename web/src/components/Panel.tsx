import type { ReactNode } from 'react';

export function Panel({
  title,
  meta,
  children,
  className,
  flush = false,
  id,
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  flush?: boolean;
  id?: string;
}) {
  return (
    <section className={`panel ${className ?? ''}`} aria-labelledby={id ?? undefined}>
      <header className="panel-head">
        <h2 className="panel-title" id={id}>
          {title}
        </h2>
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
