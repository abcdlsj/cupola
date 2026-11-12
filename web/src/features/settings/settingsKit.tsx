// taste-skill-ignore em-dash: the em dash is the missing-value mark.
/**
 * What every settings section shares: the page head with its section tabs, the
 * two-column body, the read-only notice, the inline result line and a table
 * that turns into stacked blocks on a phone.
 */
import { Fragment, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ApiError, useMe } from '../../data/queries';
import { PageHead, useIsPhone } from '../../ui/kit';
import { Banner, Grid, HStack, Link, Table, Text, VStack, type TableColumn } from '../../ui/primitives';
import { Select } from '../../ui/controls';

const SECTIONS = [
  { slug: 'nodes', label: 'Nodes' },
  { slug: 'alerts', label: 'Alerts' },
  { slug: 'tokens', label: 'Tokens' },
  { slug: 'retention', label: 'Retention' },
  { slug: 'appearance', label: 'Appearance' },
  { slug: 'account', label: 'Account' },
  { slug: 'about', label: 'About' },
];

function SettingsTabs() {
  const phone = useIsPhone();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const section = SECTIONS.find((entry) => pathname.startsWith(`/settings/${entry.slug}`))?.slug ?? 'nodes';
  if (phone) {
    return (
      <Select
        label="Settings section"
        value={section}
        options={SECTIONS.map((entry) => ({ value: entry.slug, label: entry.label }))}
        onChange={(value) => navigate(`/settings/${value}`)}
      />
    );
  }
  return (
    <nav className="tabs" aria-label="Settings sections">
      {SECTIONS.map((entry) => (
        <Link
          key={entry.slug}
          href={`/settings/${entry.slug}`}
          className="tab"
          aria-current={entry.slug === section ? 'page' : undefined}
        >
          {entry.label}
        </Link>
      ))}
    </nav>
  );
}

/** One settings screen: the head, the section tabs, then the section's bands. */
export function SettingsPage({ children }: { children: ReactNode }) {
  return (
    <VStack gap={6}>
      <VStack gap={2}>
        <PageHead title="Settings" />
        <SettingsTabs />
      </VStack>
      {children}
    </VStack>
  );
}

/** Two columns on a desktop, one on a phone. */
export function Two({ children }: { children: ReactNode }) {
  const phone = useIsPhone();
  if (phone) {
    return (
      <VStack gap={5} width="100%">
        {children}
      </VStack>
    );
  }
  return (
    <Grid columns={2} gap={6} style={{ alignItems: 'start' }}>
      {children}
    </Grid>
  );
}

/** Form fields: two across where there is room, one on a phone. */
export function Fields({ children }: { children: ReactNode }) {
  return <Grid columns={{ minWidth: 220, max: 2 }}>{children}</Grid>;
}

/** The current values beside the controls they describe. */
export function Aside({ title, rows }: { title: string; rows: Array<[string, ReactNode]> }) {
  return (
    <VStack gap={2} className="aside">
      <Text type="label">{title}</Text>
      <dl className="facts">
        {rows.map(([label, value]) => (
          <div className="fact" key={label}>
            <dt>{label}</dt>
            <dd>
              {value == null || value === '' ? (
                <span className="code is-missing">—</span>
              ) : typeof value === 'string' || typeof value === 'number' ? (
                <span className="code">{value}</span>
              ) : (
                value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </VStack>
  );
}

export type Message = { kind: 'ok' | 'error'; text: string } | null;

export function errorText(caught: unknown, fallback: string): string {
  return caught instanceof ApiError ? caught.message : fallback;
}

/** The result of the last action, in place, announced to screen readers. */
export function Notice({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <div role={message.kind === 'error' ? 'alert' : 'status'} data-testid={message.kind === 'error' ? 'form-error' : 'form-ok'}>
      <Banner status={message.kind === 'error' ? 'error' : 'success'} title={message.text} />
    </div>
  );
}

/** Settings are open to read; changing them needs the admin session. */
export function AdminOnly() {
  const me = useMe();
  if (me.data?.admin) return null;
  return (
    <Banner
      status="info"
      title={`This session is read-only (${me.data?.mode === 'token' ? `token ${me.data.token_name}` : 'no admin session'}).`}
      description={
        <>
          <Link href="/login">Sign in as the hub admin</Link> to change settings.
        </>
      }
    />
  );
}

/** A required text field left empty gets this status on submit. */
export function required(value: string, missing: boolean) {
  return missing && !value.trim() ? { type: 'error' as const, message: 'Required' } : undefined;
}

export function splitList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * A data-driven table on a desktop; below 900 px each row becomes a block: the
 * first column as its title, every other column as a label and its value.
 */
export function RowsTable<T extends Record<string, unknown>>({
  label,
  data,
  columns,
  idKey,
  testId,
}: {
  label: string;
  data: T[];
  columns: Array<TableColumn<T>>;
  idKey: (row: T) => string;
  testId?: string;
}) {
  const phone = useIsPhone();
  if (!phone) {
    return (
      <div data-testid={testId}>
        <Table label={label} data={data} columns={columns} idKey={(row) => idKey(row)} />
      </div>
    );
  }
  const [head, ...rest] = columns;
  const cell = (column: TableColumn<T>, row: T): ReactNode =>
    column.renderCell ? column.renderCell(row) : String(row[column.key] ?? '—');
  return (
    <div className="rows" role="list" aria-label={label} data-testid={testId}>
      {data.map((row) => (
        <div key={idKey(row)} role="listitem" style={{ padding: '10px 0' }}>
          <VStack gap={2}>
            {cell(head, row)}
            {rest.map((column) => (
              <HStack key={column.key} gap={3} vAlign="center" hAlign="between" wrap>
                {column.header ? <span className="muted small">{column.header}</span> : null}
                {cell(column, row)}
              </HStack>
            ))}
          </VStack>
        </div>
      ))}
    </div>
  );
}

export { Fragment };
