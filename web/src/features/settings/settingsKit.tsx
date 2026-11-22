// taste-skill-ignore em-dash: the em dash is the missing-value mark.
/**
 * Beszel-style Settings card: one spacious card with a left icon sidebar on
 * desktop (horizontal scrollable nav on phones) and clean content area.
 */
import { Fragment, type ComponentType, type ReactNode } from 'react';
import {
  Bell,
  Database,
  HardDrives,
  Info,
  Key,
  Palette,
  User,
} from '@phosphor-icons/react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { ApiError, useMe } from '../../data/queries';
import { useIsPhone } from '../../ui/kit';
import { Banner, Grid, HStack, Link, Table, Text, VStack, type TableColumn } from '../../ui/primitives';

const SECTIONS: Array<{
  slug: string;
  label: string;
  Icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;
}> = [
  { slug: 'nodes', label: 'Nodes', Icon: HardDrives },
  { slug: 'alerts', label: 'Alerts', Icon: Bell },
  { slug: 'tokens', label: 'Tokens', Icon: Key },
  { slug: 'retention', label: 'Retention', Icon: Database },
  { slug: 'appearance', label: 'Appearance', Icon: Palette },
  { slug: 'account', label: 'Account', Icon: User },
  { slug: 'about', label: 'About', Icon: Info },
];

function SettingsNav() {
  const { pathname } = useLocation();
  const section = SECTIONS.find((entry) => pathname.startsWith(`/settings/${entry.slug}`))?.slug ?? 'nodes';
  return (
    <nav className="settings-nav" aria-label="Settings sections">
      {SECTIONS.map((entry) => {
        const Icon = entry.Icon;
        return (
          <RouterLink
            key={entry.slug}
            to={`/settings/${entry.slug}`}
            className="settings-nav-item"
            aria-current={entry.slug === section ? 'page' : undefined}
          >
            <Icon size={16} aria-hidden={true} />
            <span>{entry.label}</span>
          </RouterLink>
        );
      })}
    </nav>
  );
}

/** One Beszel settings card: header, hairline, left sidebar nav and content. */
export function SettingsPage({ children }: { children: ReactNode }) {
  return (
    <section className="beszel-card" aria-label="Settings">
      <header className="beszel-card-head">
        <div className="beszel-card-title-group">
          <h1>Settings</h1>
          <p>Manage nodes, alert channels, API tokens, retention and appearance.</p>
        </div>
      </header>
      <hr />
      <div className="settings-layout">
        <SettingsNav />
        <div className="settings-content">{children}</div>
      </div>
    </section>
  );
}

/** Two columns on a desktop, one on a phone. Asymmetric by default (form + aside). */
export function Two({ children, equal = false }: { children: ReactNode; equal?: boolean }) {
  return <div className={equal ? 'settings-two-equal' : 'settings-two'}>{children}</div>;
}

/** Form fields: two across where there is room, one on a phone. */
export function Fields({ children }: { children: ReactNode }) {
  return <Grid columns={{ minWidth: 200, max: 2 }}>{children}</Grid>;
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
    <div className="rows-card" data-testid={testId}>
      <div className="rows" role="list" aria-label={label}>
        {data.map((row) => (
          <div key={idKey(row)} role="listitem" style={{ padding: '12px 16px' }}>
            <VStack gap={2}>
              {cell(head, row)}
              {rest.map((column) => (
                <HStack
                  key={column.key}
                  gap={3}
                  vAlign="center"
                  hAlign={column.header ? 'between' : 'end'}
                  wrap
                  style={column.header ? undefined : { borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 2 }}
                >
                  {column.header ? <span className="muted small">{column.header}</span> : null}
                  {cell(column, row)}
                </HStack>
              ))}
            </VStack>
          </div>
        ))}
      </div>
    </div>
  );
}

export { Fragment };
