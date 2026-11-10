import type { ReactNode } from 'react';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { SeriesChart, type ChartMarker, type ChartSeries, type ChartUnit } from './SeriesChart';

/**
 * One metric in a chart grid: title and one line of context on the left, the
 * current reading on the right, the chart, and a swatch legend when there is
 * more than one series. Loading and empty windows keep the frame's height.
 */
export function ChartCard({
  title,
  desc,
  now,
  series,
  unit,
  threshold,
  marker,
  maxValue,
  pending = false,
  empty = 'No sample in this window yet.',
  height = 152,
  legend,
}: {
  title: string;
  desc: ReactNode;
  now?: ReactNode;
  series: ChartSeries[];
  unit: ChartUnit;
  threshold?: number;
  marker?: ChartMarker;
  maxValue?: number;
  pending?: boolean;
  empty?: string;
  height?: number;
  /** current value per series, printed beside its swatch */
  legend?: ReactNode[];
}) {
  // one sample is a dot, not a curve: wait for the second before drawing axes
  const hasData = series.some((entry) => entry.points.length > 1);
  return (
    <Card>
      <section aria-label={title}>
        <VStack gap={2}>
          <HStack hAlign="between" vAlign="start" gap={3}>
            <VStack gap={0.5}>
              <Heading level={3}>{title}</Heading>
              <Text type="supporting">{desc}</Text>
            </VStack>
            {now != null ? (
              <Text type="code" size="lg" hasTabularNumbers textWrap="nowrap">
                {now}
              </Text>
            ) : null}
          </HStack>
          {hasData ? (
            <SeriesChart
              series={series}
              unit={unit}
              threshold={threshold}
              marker={marker}
              maxValue={maxValue}
              label={title}
              height={height}
            />
          ) : (
            <VStack height={height} hAlign="center" vAlign="center">
              <Text type="supporting">{pending ? 'Loading this window from the hub…' : empty}</Text>
            </VStack>
          )}
          {series.length > 1 ? (
            <HStack gap={4} wrap="wrap">
              {series.map((entry, index) => (
                <HStack key={entry.label} gap={1.5} vAlign="center">
                  <span
                    aria-hidden="true"
                    style={{ width: 8, height: 8, borderRadius: 999, background: entry.color, flex: 'none' }}
                  />
                  <Text type="supporting">{entry.label}</Text>
                  {legend?.[index] != null ? (
                    <Text type="code" hasTabularNumbers>
                      {legend[index]}
                    </Text>
                  ) : null}
                </HStack>
              ))}
            </HStack>
          ) : null}
        </VStack>
      </section>
    </Card>
  );
}
