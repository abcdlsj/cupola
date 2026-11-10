import { useRef, type ReactNode } from 'react';
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
 * A headline number. The dot carries the state so the figure stays ink, and the
 * meter appears only when the number is a percentage worth reading as a bar.
 */
export function Kpi({
  label,
  value,
  unit,
  state,
  note,
  meter,
  digits = 0,
}: {
  label: string;
  value: string | number | null;
  unit?: string;
  state?: 'success' | 'warning' | 'error' | 'neutral' | 'accent';
  note?: string;
  meter?: number | null;
  digits?: number;
}) {
  return (
    <Card padding={4}>
      <VStack gap={2}>
        <HStack gap={2} vAlign="center">
          {state ? <StatusDot variant={state} label={label} /> : null}
          <Text type="label" color="secondary">
            {label}
          </Text>
        </HStack>
        <Figure
          value={value}
          unit={unit}
          digits={digits}
          size={typeof value === 'string' && value.length > 6 ? 'code' : 'heading'}
        />
        {meter !== undefined ? (
          <Meter value={meter} label={label} width={140} showValue={false} digits={digits} />
        ) : null}
        {note ? <Text type="supporting">{note}</Text> : null}
      </VStack>
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
}: {
  title: string;
  desc: string;
  lines: { label: string; seed: number; base: number; swing: number }[];
  height?: number;
  yMax?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  return (
    <Card>
      <VStack gap={2}>
        <VStack gap={0.5}>
          <Heading level={3}>{title}</Heading>
          <Text type="supporting">{desc}</Text>
        </VStack>
        <div ref={host}>
          <Chart
            host={host}
            timestamps={timestamps}
            height={height}
            yMax={yMax}
            series={lines.map((line) => ({
              label: line.label,
              data: series(line.seed, line.base, line.swing),
            }))}
          />
        </div>
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
