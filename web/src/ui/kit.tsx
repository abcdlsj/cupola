// taste-skill-ignore em-dash: the em dash here is the missing-value mark the app
// rules ask for ("a missing value is a grey dash"), not prose punctuation.
/**
 * Cupola's page vocabulary on Astryx. Pages compose these with Astryx's own
 * stacks, cards and tables; nothing here sets a colour, only token variants.
 */
import { Children, type ReactNode } from 'react';
import { Card } from '@astryxdesign/core/Card';
import { Divider } from '@astryxdesign/core/Divider';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';

/** The shell, tables and tabs switch layouts at the same width. */
export const PHONE_QUERY = '(max-width: 899px)';

export function useIsPhone(): boolean {
  return useMediaQuery(PHONE_QUERY);
}

export type Tone = 'success' | 'warning' | 'error' | 'neutral' | 'accent';

/** Where a meter turns amber and red; a healthy meter is the accent, not green. */
export const METER_WARN = 75;
export const METER_CRIT = 90;

export function levelOf(value: number | null | undefined): 'accent' | 'warning' | 'error' | 'neutral' {
  if (value == null || !Number.isFinite(value)) return 'neutral';
  if (value >= METER_CRIT) return 'error';
  if (value >= METER_WARN) return 'warning';
  return 'accent';
}

/** A figure in mono with its unit stepped back in the UI face. Missing is a dash. */
export function Figure({
  value,
  digits = 1,
  unit,
  size,
}: {
  value: number | string | null | undefined;
  digits?: number;
  unit?: string;
  size?: 'code' | 'heading';
}) {
  const missing = value == null || (typeof value === 'number' && !Number.isFinite(value));
  const text = missing ? '—' : typeof value === 'number' ? value.toFixed(digits) : value;
  return (
    <HStack gap={0.5} vAlign="center">
      {size === 'heading' ? (
        <Heading level={2}>{text}</Heading>
      ) : (
        <Text type="code" hasTabularNumbers textWrap="nowrap" color={missing ? 'secondary' : undefined}>
          {text}
        </Text>
      )}
      {unit && !missing ? <Text type="supporting">{unit}</Text> : null}
    </HStack>
  );
}

/**
 * Every percentage in a table or list: a thin bar plus the figure. `neutral`
 * is for data that is not health (a process's share of the CPU).
 */
export function Meter({
  value,
  label,
  digits = 0,
  width = 96,
  showValue = true,
  tone,
  text,
}: {
  value: number | null | undefined;
  label: string;
  digits?: number;
  width?: number | string;
  showValue?: boolean;
  tone?: 'neutral';
  /** printed instead of the percentage */
  text?: string;
}) {
  const missing = value == null || !Number.isFinite(value);
  const clamped = missing ? 0 : Math.max(0, Math.min(100, value));
  const variant = missing ? 'neutral' : tone === 'neutral' ? 'accent' : levelOf(value);
  return (
    <HStack gap={2} vAlign="center">
      <VStack width={width}>
        <ProgressBar label={label} value={clamped} variant={variant} isLabelHidden isDisabled={missing} />
      </VStack>
      {showValue ? (
        <HStack gap={0.5} vAlign="center">
          <Text type="code" hasTabularNumbers textWrap="nowrap" color={missing ? 'secondary' : undefined}>
            {missing ? '—' : text ?? clamped.toFixed(digits)}
          </Text>
          {missing || text ? null : <Text type="supporting">%</Text>}
        </HStack>
      ) : null}
    </HStack>
  );
}

/** A headline number in a KPI strip: label (with an optional dot), value, note. */
export function KpiCell({
  label,
  value,
  unit,
  state,
  note,
  digits = 0,
}: {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  state?: Tone;
  note?: ReactNode;
  digits?: number;
}) {
  const missing = value == null || (typeof value === 'number' && !Number.isFinite(value));
  const text = missing ? '—' : typeof value === 'number' ? value.toFixed(digits) : value;
  return (
    <VStack gap={1}>
      <HStack hAlign="between" gap={2} vAlign="center">
        <Text type="supporting">{label}</Text>
        {state ? <StatusDot variant={state} label={label} /> : null}
      </HStack>
      <HStack gap={1} vAlign="end">
        <Text type="inherit" size="2xl" hasTabularNumbers color={missing ? 'secondary' : undefined}>
          {text}
        </Text>
        {unit && !missing ? <Text type="supporting">{unit}</Text> : null}
      </HStack>
      {note ? <Text type="supporting">{note}</Text> : null}
    </VStack>
  );
}

/** Equal KPI cells in one card, hairlines between; a 2-column grid on a phone. */
export function KpiStrip({ children }: { children: ReactNode }) {
  const narrow = useMediaQuery('(max-width: 699px)');
  const cells = Children.toArray(children);
  if (narrow) {
    return (
      <Card padding={3}>
        <Grid columns={2} gap={3}>
          {cells.map((cell, index) => (
            <VStack key={index} gap={0}>
              {cell}
            </VStack>
          ))}
        </Grid>
      </Card>
    );
  }
  return (
    <Card padding={0}>
      <HStack gap={0} vAlign="stretch">
        {cells.map((cell, index) => (
          <HStack key={index} gap={0} width={`${100 / cells.length}%`} vAlign="center">
            {index > 0 ? <Divider orientation="vertical" /> : null}
            <VStack gap={0} padding={4} width="100%">
              {cell}
            </VStack>
          </HStack>
        ))}
      </HStack>
    </Card>
  );
}

/** A band of the page: rule, title, one line of context, controls, content. */
export function Band({
  title,
  desc,
  actions,
  first,
  children,
  gap = 3,
}: {
  title?: string;
  desc?: ReactNode;
  actions?: ReactNode;
  first?: boolean;
  children: ReactNode;
  gap?: 2 | 3 | 4;
}) {
  return (
    <VStack gap={gap}>
      {first ? null : <Divider />}
      {title ? (
        <HStack hAlign="between" vAlign="end" gap={3} wrap="wrap">
          <VStack gap={0.5}>
            <Heading level={2}>{title}</Heading>
            {desc ? <Text type="supporting">{desc}</Text> : null}
          </VStack>
          {actions ? (
            <HStack gap={2} vAlign="center" wrap="wrap">
              {actions}
            </HStack>
          ) : null}
        </HStack>
      ) : null}
      {children}
    </VStack>
  );
}

/** The page's h1 with its context line, a leading crumb row and controls. */
export function PageHead({
  title,
  desc,
  actions,
  leading,
}: {
  title: ReactNode;
  desc?: ReactNode;
  actions?: ReactNode;
  leading?: ReactNode;
}) {
  return (
    <HStack hAlign="between" vAlign="center" gap={3} wrap="wrap" paddingBlock={2}>
      <VStack gap={1}>
        {leading}
        <Heading level={1}>{title}</Heading>
        {desc ? <Text type="supporting">{desc}</Text> : null}
      </VStack>
      {actions ? (
        <HStack gap={2} vAlign="center" wrap="wrap">
          {actions}
        </HStack>
      ) : null}
    </HStack>
  );
}

/** A titled card: heading level 3, one supporting line, controls on the right. */
export function Section({
  title,
  desc,
  actions,
  children,
  padding,
}: {
  title?: ReactNode;
  desc?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  padding?: 0 | 3 | 4;
}) {
  return (
    <Card padding={padding}>
      <VStack gap={3}>
        {title || actions ? (
          <HStack hAlign="between" vAlign="center" gap={3} wrap="wrap">
            <VStack gap={0.5}>
              {title ? <Heading level={3}>{title}</Heading> : null}
              {desc ? <Text type="supporting">{desc}</Text> : null}
            </VStack>
            {actions ? (
              <HStack gap={2} vAlign="center" wrap="wrap">
                {actions}
              </HStack>
            ) : null}
          </HStack>
        ) : null}
        {children}
      </VStack>
    </Card>
  );
}

/** One finding, one line: what, where, how bad, how old, and a way in. */
export function FindingRow({
  state,
  what,
  where,
  value,
  label,
  ago,
  action,
}: {
  state: Tone;
  what: ReactNode;
  where?: ReactNode;
  value?: number | null;
  label?: string;
  ago?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <HStack gap={3} vAlign="center" hAlign="between" paddingBlock={2} wrap="wrap">
      <HStack gap={2} vAlign="center">
        <StatusDot variant={state} label={typeof what === 'string' ? what : state} />
        <VStack gap={0}>
          <Text>{what}</Text>
          {where ? <Text type="supporting">{where}</Text> : null}
        </VStack>
      </HStack>
      <HStack gap={4} vAlign="center">
        {value !== undefined ? <Meter value={value} label={label ?? (typeof what === 'string' ? what : 'value')} /> : null}
        {ago ? <Text type="supporting">{ago}</Text> : null}
        {action}
      </HStack>
    </HStack>
  );
}

/** A label/value list, values in mono; a missing value is a dash. */
export function Facts({ rows }: { rows: Array<{ label: string; value: ReactNode }> }) {
  return (
    <VStack gap={0}>
      {rows.map((row, index) => (
        <VStack key={row.label} gap={0}>
          {index > 0 ? <Divider /> : null}
          <HStack hAlign="between" vAlign="center" gap={3} paddingBlock={2}>
            <Text type="supporting">{row.label}</Text>
            {row.value == null || row.value === '' ? (
              <Text type="code" color="secondary">
                —
              </Text>
            ) : typeof row.value === 'string' || typeof row.value === 'number' ? (
              <Text type="code" hasTabularNumbers justify="end">
                {row.value}
              </Text>
            ) : (
              row.value
            )}
          </HStack>
        </VStack>
      ))}
    </VStack>
  );
}
