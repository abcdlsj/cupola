// taste-skill-ignore em-dash: the em dash is the missing-value mark.
/**
 * What every settings section shares: the page head with its section tabs, the
 * two-column body, the read-only notice, the inline result line and a table
 * that turns into stacked blocks on a phone.
 */
import { Fragment, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import { Grid } from '@astryxdesign/core/Grid';
import { HStack } from '@astryxdesign/core/HStack';
import { Link } from '@astryxdesign/core/Link';
import { Selector } from '@astryxdesign/core/Selector';
import { Tab, TabList } from '@astryxdesign/core/TabList';
import { Table, type TableColumn } from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { ApiError, useMe } from '../../data/queries';
import { PageHead, useIsPhone } from '../../ui/kit';

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
      <Selector
        label="Settings section"
        variant="secondary"
        width="100%"
        value={section}
        options={SECTIONS.map((entry) => ({ value: entry.slug, label: entry.label }))}
        onChange={(value) => navigate(`/settings/${value}`)}
      />
    );
  }
  return (
    <TabList value={section} onChange={() => undefined} hasDivider size="sm" aria-label="Settings sections">
      {SECTIONS.map((entry) => (
        <Tab key={entry.slug} value={entry.slug} label={entry.label} href={`/settings/${entry.slug}`} />
      ))}
    </TabList>
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
  if (phone) return <VStack gap={5}>{children}</VStack>;
  return (
    <Grid columns={2} gap={6}>
      {children}
    </Grid>
  );
}

/** Form fields: two across where there is room, one on a phone. */
export function Fields({ children }: { children: ReactNode }) {
  return (
    <Grid columns={{ minWidth: 220, max: 2 }} gap={4}>
      {children}
    </Grid>
  );
}

/** The current values beside the controls they describe. */
export function Aside({ title, rows }: { title: string; rows: Array<[string, ReactNode]> }) {
  return (
    <VStack gap={2}>
      <Text type="label" color="secondary">
        {title}
      </Text>
      <VStack gap={0}>
        {rows.map(([label, value], index) => (
          <VStack key={label} gap={0}>
            {index > 0 ? <Divider /> : null}
            <HStack gap={3} vAlign="center" hAlign="between" paddingBlock={2}>
              <Text type="supporting">{label}</Text>
              {value == null || value === '' ? (
                <Text type="code" color="secondary">
                  —
                </Text>
              ) : typeof value === 'string' || typeof value === 'number' ? (
                <Text type="code" hasTabularNumbers justify="end">
                  {value}
                </Text>
              ) : (
                value
              )}
            </HStack>
          </VStack>
        ))}
      </VStack>
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
    <VStack role={message.kind === 'error' ? 'alert' : 'status'} data-testid={message.kind === 'error' ? 'form-error' : 'form-ok'}>
      <Banner status={message.kind === 'error' ? 'error' : 'success'} title={message.text} collapsible={false} />
    </VStack>
  );
}

/** Settings are open to read; changing them needs the admin session. */
export function AdminOnly() {
  const me = useMe();
  if (me.data?.admin) return null;
  return (
    <Banner
      status="info"
      collapsible={false}
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
  columns: TableColumn<T>[];
  idKey: (row: T) => string;
  testId?: string;
}) {
  const phone = useIsPhone();
  if (!phone) {
    return (
      <VStack data-testid={testId}>
        <Table aria-label={label} data={data} columns={columns} idKey={idKey} density="compact" dividers="rows" />
      </VStack>
    );
  }
  const [head, ...rest] = columns;
  const cell = (column: TableColumn<T>, row: T): ReactNode =>
    column.renderCell ? column.renderCell(row) : String(row[column.key as keyof T] ?? '—');
  return (
    <VStack gap={0} role="list" aria-label={label} data-testid={testId}>
      {data.map((row, index) => (
        <Fragment key={idKey(row)}>
          {index > 0 ? <Divider /> : null}
          <VStack gap={2} paddingBlock={3} role="listitem">
            {cell(head, row)}
            {rest.map((column) => (
              <HStack key={String(column.key)} gap={3} vAlign="center" hAlign="between" wrap="wrap">
                {column.header ? <Text type="supporting">{column.header}</Text> : null}
                {cell(column, row)}
              </HStack>
            ))}
          </VStack>
        </Fragment>
      ))}
    </VStack>
  );
}
