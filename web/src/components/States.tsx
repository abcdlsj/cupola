import type { ReactNode } from 'react';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Divider } from '@astryxdesign/core/Divider';
import { Grid } from '@astryxdesign/core/Grid';
import { HStack } from '@astryxdesign/core/HStack';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';

/** A block that failed to load: what failed, and a retry. */
export function ErrorPanel({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <Banner
      status="error"
      title={what}
      collapsible={false}
      endContent={<Button label="Retry" variant="secondary" size="sm" onClick={onRetry} />}
    />
  );
}

/** One quiet line where a list would be. */
export function Empty({ children }: { children: ReactNode }) {
  return (
    <VStack paddingBlock={4}>
      <Text type="supporting">{children}</Text>
    </VStack>
  );
}

/**
 * Loading keeps the shape of the screen: rows where rows will land, chart
 * frames of the real height. Never one grey block per card.
 */
export function LoadingRows({ rows = 6, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <VStack gap={0} aria-hidden="true">
      {Array.from({ length: rows }, (_, row) => (
        <VStack key={row} gap={0}>
          {row > 0 ? <Divider /> : null}
          <HStack gap={4} vAlign="center" paddingBlock={3}>
            {Array.from({ length: columns }, (_, column) => (
              <VStack key={column} width={column === 0 ? '30%' : `${60 / Math.max(columns - 1, 1)}%`}>
                <Skeleton height={10} width={column === 0 ? '70%' : '50%'} index={row} />
              </VStack>
            ))}
          </HStack>
        </VStack>
      ))}
    </VStack>
  );
}

export function LoadingCharts({ count = 4, height = 152 }: { count?: number; height?: number }) {
  return (
    <Grid columns={{ minWidth: 320, repeat: 'fit' }} gap={3} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <Card key={index}>
          <VStack gap={2}>
            <Skeleton height={14} width={120} index={index} />
            <Skeleton height={10} width={200} index={index} />
            <Skeleton height={height} index={index} />
          </VStack>
        </Card>
      ))}
    </Grid>
  );
}

export function LoadingPage({ title }: { title?: string }) {
  return (
    <VStack gap={6} aria-busy="true">
      <VStack gap={1} paddingBlock={2}>
        {title ? <Text type="supporting">{title}</Text> : null}
        <Skeleton height={26} width={180} />
      </VStack>
      <LoadingRows />
    </VStack>
  );
}
