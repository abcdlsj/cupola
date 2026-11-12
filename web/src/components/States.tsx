import type { ReactNode } from 'react';
import { Banner, Button, Grid, HStack, Skeleton, VStack } from '../ui/primitives';

/** A block that failed to load: what failed, and a retry. */
export function ErrorPanel({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <Banner
      status="error"
      title={what}
      endContent={
        <Button label="Retry" size="sm" onClick={onRetry} />
      }
    />
  );
}

/** One quiet line where a list would be. */
export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="muted small" style={{ padding: '16px 0' }}>
      {children}
    </p>
  );
}

/**
 * Loading keeps the shape of the screen: rows where rows will land, chart
 * frames of the real height. Never one grey block per card.
 */
export function LoadingRows({ rows = 6, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: rows }, (_, row) => (
        <HStack key={row} gap={4} vAlign="center" paddingBlock={3} style={{ borderTop: row ? '1px solid var(--border)' : undefined }}>
          {Array.from({ length: columns }, (_, column) => (
            <span key={column} style={{ width: column === 0 ? '30%' : `${60 / Math.max(columns - 1, 1)}%` }}>
              <Skeleton height={10} width={column === 0 ? '70%' : '50%'} />
            </span>
          ))}
        </HStack>
      ))}
    </div>
  );
}

export function LoadingCharts({ count = 4, height = 152 }: { count?: number; height?: number }) {
  return (
    <Grid columns={{ minWidth: 320, repeat: 'fit' }} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <section className="panel" key={index} style={{ padding: 14, gap: 8 }}>
          <Skeleton height={14} width={120} />
          <Skeleton height={10} width={200} />
          <Skeleton height={height} />
        </section>
      ))}
    </Grid>
  );
}

export function LoadingPage({ title }: { title?: string }) {
  return (
    <VStack gap={6} aria-busy="true">
      <VStack gap={1} paddingBlock={2}>
        {title ? <span className="muted small">{title}</span> : null}
        <Skeleton height={26} width={180} />
      </VStack>
      <LoadingRows />
    </VStack>
  );
}
