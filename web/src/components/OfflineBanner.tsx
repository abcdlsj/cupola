import { Banner } from '../ui/primitives';
import { clock, relative } from '../lib/format';
import { useOnline } from '../lib/hooks';

/** One quiet notice: the snapshot on screen is the last one this device saw. */
export function OfflineBanner({ lastUpdated, stale }: { lastUpdated: number; stale: boolean }) {
  const online = useOnline();
  if (online && !stale) return null;
  return (
    <Banner
      status="warning"
      title={online ? 'The hub stopped answering.' : 'Offline.'}
      description={`Showing the snapshot from ${clock(lastUpdated)} UTC, ${relative(lastUpdated, Date.now())}.`}
    />
  );
}
