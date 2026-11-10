// taste-skill-ignore em-dash: the em dash here is the missing-value mark the app
// rules ask for ("a missing value is a grey dash"), not prose punctuation.
import { Children, useRef, type ReactNode } from 'react';
import { Card } from '@astryxdesign/core/Card';
import { Divider } from '@astryxdesign/core/Divider';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import { Chart } from './Chart';
import { series, timestamps } from './fixtures';

export type Level = 'accent' | 'warning' | 'error' | 'neutral';

export function levelOf(value: number | null): Level {
  if (value == null) return 'neutral';
  if (value >= 90) return 'error';
  if (value >= 75) return 'warning';
  return 'accent';
}

export function Figure({
  value,
  digits = 1,
  unit,
  size,
}: {
  value: number | string | null;
  digits?: number;
  unit?: string;
  size?: 'code' | 'heading';
}) {
  const text = value == null ? '—' : typeof value === 'number' ? value.toFixed(digits) : value;
  return (
    <HStack gap={0.5} vAlign="center">
      {size === 'heading' ? (
        <Heading level={2}>{text}</Heading>
      ) : (
        <Text type="code" hasTabularNumbers textWrap="nowrap">
          {text}
        </Text>
      )}
      {unit ? <Text type="supporting">{unit}</Text> : null}
    </HStack>
  );
}

export function Meter({
  value,
  label,
  digits = 1,
  width,
  showValue = true,
}: {
  value: number | null;
  label: string;
  digits?: number;
  width?: number;
  showValue?: boolean;
}) {
  return (
    <HStack gap={2} vAlign="center">
      <VStack width={width ?? 96}>
        <ProgressBar
          label={label}
          value={value ?? 0}
          variant={levelOf(value)}
          isLabelHidden
          isDisabled={value == null}
        />
      </VStack>
      {showValue ? (
        <HStack gap={0.5} vAlign="center">
          <Text type="code" hasTabularNumbers textWrap="nowrap">
            {value == null ? '—' : value.toFixed(digits)}
          </Text>
          <Text type="supporting">%</Text>
        </HStack>
      ) : null}
    </HStack>
  );
}

/**
 * A headline number. One container split by hairlines, not one card per figure:
 * the study's screens give a KPI no tile of its own.
 */
export function KpiCell({
  label,
  value,
  unit,
  state,
  note,
  digits = 0,
}: {
  label: string;
  value: string | number | null;
  unit?: string;
  state?: 'success' | 'warning' | 'error' | 'neutral' | 'accent';
  note?: string;
  digits?: number;
}) {
  const text = value == null ? '—' : typeof value === 'number' ? value.toFixed(digits) : value;
  return (
    <VStack gap={1}>
      <HStack hAlign="between" gap={2} vAlign="center">
        <Text type="supporting">{label}</Text>
        {state ? <StatusDot variant={state} label={label} /> : null}
      </HStack>
      <HStack gap={1} vAlign="end">
        <Text type="inherit" size="2xl" hasTabularNumbers>
          {text}
        </Text>
        {unit ? <Text type="supporting">{unit}</Text> : null}
      </HStack>
      {note ? <Text type="supporting">{note}</Text> : null}
    </VStack>
  );
}

/** The strip: equal cells, one hairline between each, two columns on a phone. */
export function KpiStrip({ children }: { children: ReactNode }) {
  const phone = useMediaQuery('(max-width: 699px)');
  const cells = Children.toArray(children);
  if (phone) {
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

/** Two tiles across on a phone, a fit-width row on anything wider. */
export function KpiGrid({ children }: { children: ReactNode }) {
  const phone = useMediaQuery('(max-width: 699px)');
  if (phone) {
    return (
      <Grid columns={2} gap={2}>
        {children}
      </Grid>
    );
  }
  return (
    <Grid columns={{ minWidth: 210, repeat: 'fit' }} gap={3}>
      {children}
    </Grid>
  );
}

/** A band of the page: rule, title, one line of context, then the content. */
export function Band({
  title,
  desc,
  actions,
  first,
  children,
  gap = 3,
}: {
  title?: string;
  desc?: string;
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
          {actions ? <HStack gap={2}>{actions}</HStack> : null}
        </HStack>
      ) : null}
      {children}
    </VStack>
  );
}

/** One finding, one line: what, where, how bad, how old. */
export function FindingRow({
  state,
  what,
  where,
  value,
  label,
  ago,
  href,
  action,
}: {
  state: 'success' | 'warning' | 'error' | 'neutral' | 'accent';
  what: string;
  where?: string;
  value?: number | null;
  label?: string;
  ago?: string;
  href?: string;
  action?: ReactNode;
}) {
  return (
    <HStack gap={3} vAlign="center" hAlign="between" paddingBlock={2} wrap="wrap">
      <HStack gap={2} vAlign="center">
        <StatusDot variant={state} label={what} />
        <VStack gap={0}>
          <Text>{what}</Text>
          {where ? <Text type="supporting">{where}</Text> : null}
        </VStack>
      </HStack>
      <HStack gap={4} vAlign="center">
        {value !== undefined ? <Meter value={value} label={label ?? what} /> : null}
        {ago ? <Text type="supporting">{ago}</Text> : null}
        {action}
        {href ? <a href={href}>Open</a> : null}
      </HStack>
    </HStack>
  );
}

export function ChartCard({
  title,
  desc,
  lines,
  height = 180,
  yMax,
  unit,
  empty,
}: {
  title: string;
  desc: string;
  lines: { label: string; seed: number; base: number; swing: number }[];
  height?: number;
  yMax?: number;
  unit?: string;
  /** A frame with one sentence beats a flat line when nothing was reported. */
  empty?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  return (
    <Card>
      <VStack gap={2}>
        <VStack gap={0.5}>
          <Heading level={3}>{title}</Heading>
          <Text type="supporting">{desc}</Text>
        </VStack>
        {empty ? (
          <VStack gap={2} paddingBlock={height > 190 ? 6 : 4}>
            <Text type="supporting">{empty}</Text>
          </VStack>
        ) : (
          <div ref={host}>
            <Chart
              host={host}
              timestamps={timestamps}
              height={height}
              yMax={yMax}
              unit={unit}
              series={lines.map((line) => ({
                label: line.label,
                data: series(line.seed, line.base, line.swing),
              }))}
            />
          </div>
        )}
      </VStack>
    </Card>
  );
}

export function PageHead({
  title,
  desc,
  actions,
  leading,
}: {
  title: string;
  desc?: string;
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
      {actions ? <HStack gap={2}>{actions}</HStack> : null}
    </HStack>
  );
}
