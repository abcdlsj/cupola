import { useRef, type ReactNode } from 'react';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
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
}: {
  value: number | string | null;
  digits?: number;
  unit?: string;
}) {
  const text = value == null ? '—' : typeof value === 'number' ? value.toFixed(digits) : value;
  return (
    <HStack gap={0.5} vAlign="center">
      <Text type="code" hasTabularNumbers textWrap="nowrap">
        {text}
      </Text>
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

/** A named figure with its meter, the unit Cupola repeats on every page. */
export function Stat({
  label,
  value,
  suffix,
  meter,
  caption,
}: {
  label: string;
  value: string;
  suffix?: string;
  meter?: number | null;
  caption?: string;
}) {
  return (
    <VStack gap={1.5}>
      <Text type="supporting">{label}</Text>
      <HStack gap={0.5} vAlign="center">
        <Text type="code" hasTabularNumbers>
          {value}
        </Text>
        {suffix ? <Text type="supporting">{suffix}</Text> : null}
      </HStack>
      {meter !== undefined ? (
        <VStack width={120}>
          <Meter value={meter} label={label} width={120} showValue={false} />
        </VStack>
      ) : null}
      {caption ? <Text type="supporting">{caption}</Text> : null}
    </VStack>
  );
}

export function PageHead({
  title,
  desc,
  actions,
}: {
  title: string;
  desc?: string;
  actions?: ReactNode;
}) {
  return (
    <HStack hAlign="between" vAlign="end" gap={3} wrap="wrap">
      <VStack gap={1}>
        <Heading level={1}>{title}</Heading>
        {desc ? <Text type="supporting">{desc}</Text> : null}
      </VStack>
      {actions ? <HStack gap={2}>{actions}</HStack> : null}
    </HStack>
  );
}

export function ChartCard({
  title,
  desc,
  lines,
  height = 180,
}: {
  title: string;
  desc: string;
  lines: { label: string; seed: number; base: number; swing: number }[];
  height?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  return (
    <Card>
      <VStack gap={2}>
        <VStack gap={0.5}>
          <Heading level={2}>{title}</Heading>
          <Text type="supporting">{desc}</Text>
        </VStack>
        <div ref={host}>
          <Chart
            host={host}
            timestamps={timestamps}
            height={height}
            series={lines.map((line) => ({ label: line.label, data: series(line.seed, line.base, line.swing) }))}
          />
        </div>
      </VStack>
    </Card>
  );
}

export function CardSection({
  title,
  desc,
  actions,
  padding = 3,
  children,
}: {
  title?: string;
  desc?: string;
  actions?: ReactNode;
  padding?: 0 | 1 | 2 | 3 | 4 | 5;
  children: ReactNode;
}) {
  return (
    <Card padding={padding}>
      <VStack gap={3}>
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
    </Card>
  );
}
